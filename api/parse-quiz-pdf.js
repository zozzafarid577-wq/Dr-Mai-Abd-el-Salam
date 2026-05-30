import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured in Vercel environment variables.' });
  }

  const { pdf_base64, title, course_id, module_id, is_mock, time_limit_min } = req.body;
  if (!pdf_base64 || !title || !course_id) {
    return res.status(400).json({ error: 'pdf_base64, title, and course_id are required' });
  }

  // Parse PDF with Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let parsedQuestions;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 },
          },
          {
            type: 'text',
            text: `Extract every multiple-choice question from this biology quiz PDF.
Return ONLY a valid JSON array — no markdown fences, no explanation text.
Each element must have exactly these fields:
{
  "question_text": "Full question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct_index": 0,
  "explanation": "Why this answer is correct (optional, can be empty string)"
}
Rules:
- correct_index is 0-based (0 = first option, 1 = second, etc.)
- options array should have 2–5 items
- Remove any question-number prefixes from question_text
- If you cannot determine the correct answer, set correct_index to 0 and note it in explanation
- Return ONLY the JSON array`
          }
        ]
      }]
    });

    const raw = (msg.content[0]?.text || '').trim();
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsedQuestions = JSON.parse(jsonStr);
    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      throw new Error('No questions found in PDF');
    }
  } catch (e) {
    return res.status(422).json({ error: 'Could not parse PDF: ' + e.message });
  }

  // Create practice test record
  const { data: test, error: testErr } = await supabaseAdmin
    .from('practice_tests')
    .insert({
      title,
      course_id,
      module_id: module_id || null,
      is_active: true,
      is_mock: !!is_mock,
      time_limit_min: time_limit_min ? parseInt(time_limit_min) : null,
    })
    .select()
    .single();

  if (testErr) return res.status(500).json({ error: testErr.message });

  // Insert questions
  const rows = parsedQuestions.map((q, i) => ({
    test_id: test.id,
    question_text: String(q.question_text || '').trim(),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct_index: Number.isInteger(q.correct_index) ? q.correct_index : 0,
    explanation: q.explanation || null,
    order_index: i,
    points: 1,
  }));

  const { error: qErr } = await supabaseAdmin.from('test_questions').insert(rows);
  if (qErr) {
    await supabaseAdmin.from('practice_tests').delete().eq('id', test.id);
    return res.status(500).json({ error: qErr.message });
  }

  return res.status(200).json({
    test_id: test.id,
    title,
    questions_created: rows.length,
    is_mock: !!is_mock,
  });
}
