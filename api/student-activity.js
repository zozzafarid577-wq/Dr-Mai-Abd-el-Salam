import { createClient } from '@supabase/supabase-js';
import { reviewCard } from './_lib/srs.js';

// Student-facing activity endpoint. One function, two actions, to stay within
// Vercel's per-deployment function limit:
//   GET  ?action=leaderboard&window=7|30|all
//   POST  { action: 'flashcard-review', question_id, correct }
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Per-request client carrying the caller's token, so RLS / SECURITY DEFINER
  // scope everything to this student.
  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const action = req.query?.action || req.body?.action;
  if (action === 'leaderboard')      return leaderboard(req, res, user, userClient);
  if (action === 'flashcard-review') return flashcardReview(req, res, user, userClient);
  return res.status(400).json({ error: "action must be 'leaderboard' or 'flashcard-review'" });
}

async function leaderboard(req, res, user, userClient) {
  const rawWindow = (req.query?.window ?? req.body?.window);
  const window_days = rawWindow === 'all' ? 0 : (parseInt(rawWindow) || 7);

  const { data, error } = await userClient.rpc('get_leaderboard', { window_days });
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data || []).map((r, i) => ({ ...r, rank: i + 1, is_me: r.student_id === user.id }));
  const me = rows.find((r) => r.is_me) || null;
  return res.status(200).json({ window_days, leaderboard: rows, me });
}

async function flashcardReview(req, res, user, userClient) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question_id, correct } = req.body || {};
  if (!question_id || typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'question_id and boolean correct are required' });
  }

  const { data: prev } = await userClient
    .from('flashcard_progress')
    .select('box, reviews, correct')
    .eq('student_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle();

  const next = reviewCard(prev, correct);

  const { data, error } = await userClient
    .from('flashcard_progress')
    .upsert({ student_id: user.id, question_id, ...next }, { onConflict: 'student_id,question_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
