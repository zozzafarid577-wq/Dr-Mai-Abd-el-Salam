import { createClient } from '@supabase/supabase-js';

const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Call the leaderboard RPC as the signed-in user so SECURITY DEFINER
  // can return an aggregate ranking without exposing other students' rows.
  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const rawWindow = (req.query?.window ?? req.body?.window);
  const window_days = rawWindow === 'all' ? 0 : (parseInt(rawWindow) || 7);

  const { data, error } = await userClient.rpc('get_leaderboard', { window_days });
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data || []).map((r, i) => ({ ...r, rank: i + 1, is_me: r.student_id === user.id }));
  const me = rows.find((r) => r.is_me) || null;

  return res.status(200).json({ window_days, leaderboard: rows, me });
}
