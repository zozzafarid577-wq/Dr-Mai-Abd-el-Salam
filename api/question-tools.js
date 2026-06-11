import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { extractJsonArray, normalizeQuestion, parseQuestionsFromText } from './_lib/questions.js';

// Admin-only question authoring tools. One function, two actions, to stay
// within Vercel's per-deployment function limit:
//   { action: 'generate',  topic, count, difficulty, notes }  -> AI drafts
//   { action: 'parse-text', text }                            -> parse pasted MCQs
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

  const { action } = req.body || {};
  if (action === 'parse-text') return parseText(req, res);
  if (action === 'generate')   return generate(req, res);
  return res.status(400).json({ error: "action must be 'generate' or 'parse-text'" });
}

function parseText(req, res) {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });

  const questions = parseQuestionsFromText(text);
  if (!questions.length) {
    return res.status(422).json({
      error: 'No questions could be parsed. Expected blocks like: a question with A)/- options and an "Answer: X" line (or * on the correct one); a statement with "Answer: True/False"; a question with "Answer: text" for fill-in-blank; or "Terms: a, b, c" followed by statements ending in "= A".',
    });
  }
  return res.status(200).json({ questions, parsed: questions.length });
}

async function generate(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured in Vercel environment variables.' });
  }

  const { topic, count, difficulty, notes } = req.body || {};
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'topic is required' });

  const n = Math.min(Math.max(parseInt(count) || 5, 1), 20);
  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let questions;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are writing multiple-choice questions for a biology study portal.

Topic: ${String(topic).trim()}
Number of questions: ${n}
Difficulty: ${diff}
${notes ? 'Extra instructions: ' + String(notes).trim() + '\n' : ''}
Return ONLY a valid JSON array — no markdown fences, no commentary.
Each element must have exactly these fields:
{
  "question_text": "Full question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct_index": 0,
  "explanation": "One sentence explaining why the answer is correct"
}
Rules:
- correct_index is 0-based.
- Provide exactly 4 options unless the topic strongly implies True/False.
- Make distractors plausible and at the requested difficulty.
- Return ONLY the JSON array.`,
      }],
    });

    const raw = (msg.content[0]?.text || '').trim();
    questions = extractJsonArray(raw).map(normalizeQuestion).filter(Boolean);
    if (!questions.length) throw new Error('No usable questions were generated');
  } catch (e) {
    return res.status(422).json({ error: 'Could not generate questions: ' + e.message });
  }

  return res.status(200).json({ questions });
}
