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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Verify admin: JWT app_metadata first, then profiles table fallback
  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id is required' });

  // Safety: never allow deleting an admin account through this endpoint
  const { data: target } = await supabaseAdmin
    .from('profiles').select('role').eq('id', student_id).single();
  if (target && target.role !== 'student') {
    return res.status(403).json({ error: 'Only student accounts can be deleted here.' });
  }

  // Delete the auth user. Profile + enrollments + attempts cascade via FK ON DELETE CASCADE.
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(student_id);
  if (delErr) return res.status(500).json({ error: delErr.message });

  // Best-effort cleanup of the profile row in case the cascade didn't fire
  await supabaseAdmin.from('profiles').delete().eq('id', student_id);

  return res.status(200).json({ success: true });
}
