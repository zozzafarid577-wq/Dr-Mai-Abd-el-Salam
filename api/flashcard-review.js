import { createClient } from '@supabase/supabase-js';
import { reviewCard } from './_lib/srs.js';

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

  const { question_id, correct } = req.body || {};
  if (!question_id || typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'question_id and boolean correct are required' });
  }

  // Use the caller's token so RLS keeps each student scoped to their own rows.
  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

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
