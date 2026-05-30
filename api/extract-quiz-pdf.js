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
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });
  }

  const { pdf_base64 } = req.body;
  if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 is required' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
- Extract ONLY questions that appear in this PDF — do not add external knowledge
- If you cannot determine the correct answer, set correct_index to 0 and note it in explanation
- Return ONLY the JSON array`
          }
        ]
      }]
    });

    const raw = (msg.content[0]?.text || '').trim();
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const questions = JSON.parse(jsonStr);
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('No questions found in PDF');
    }

    return res.status(200).json({ questions });
  } catch (e) {
    return res.status(422).json({ error: 'Could not parse PDF: ' + e.message });
  }
}
