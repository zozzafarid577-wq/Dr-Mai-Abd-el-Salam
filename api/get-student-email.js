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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ error: 'student_id is required' });

  const { data: { user: target }, error } = await supabaseAdmin.auth.admin.getUserById(student_id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ email: target?.email || null });
}
