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

  const { student_id, email } = req.body;
  if (!student_id || !email) return res.status(400).json({ error: 'student_id and email are required' });

  const { data: target } = await supabaseAdmin.from('profiles').select('is_owner').eq('id', student_id).single();
  if (target?.is_owner && student_id !== user.id) {
    return res.status(403).json({ error: 'Cannot change the owner account email here.' });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(student_id, { email });
  if (error) return res.status(500).json({ error: error.message });

  try {
    await supabaseAdmin.from('security_events').insert({
      student_id: user.id, student_name: user.email,
      event_type: 'admin_action', detail: `Changed email for ${student_id} to ${email}`, page: 'admin',
    });
  } catch (_) {}

  return res.status(200).json({ ok: true });
}
