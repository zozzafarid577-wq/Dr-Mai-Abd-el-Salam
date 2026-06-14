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

function generatePassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  let pw = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = pw.length; i < length; i++) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  return pw.sort(() => Math.random() - 0.5).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Verify admin: check JWT app_metadata first, then fall back to the profiles table
  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { student_id, action, email } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id is required' });

  // Never let anyone but the owner act on the owner's account.
  const { data: target } = await supabaseAdmin
    .from('profiles').select('is_owner').eq('id', student_id).single();
  if (target?.is_owner && student_id !== user.id) {
    return res.status(403).json({ error: 'The main host’s account cannot be changed here.' });
  }

  // ── Read the student's login email (auth.users isn't readable client-side).
  if (action === 'get_email') {
    const { data: u, error: e } = await supabaseAdmin.auth.admin.getUserById(student_id);
    if (e) return res.status(500).json({ error: e.message });
    return res.status(200).json({ email: u?.user?.email || null });
  }

  // ── Change the student's login email.
  if (action === 'set_email') {
    if (!email) return res.status(400).json({ error: 'email is required' });
    const { error: e } = await supabaseAdmin.auth.admin.updateUserById(student_id, { email });
    if (e) return res.status(500).json({ error: e.message });
    try {
      await supabaseAdmin.from('security_events').insert({
        student_id: user.id, student_name: user.email,
        event_type: 'admin_action', detail: `Changed email for ${student_id} to ${email}`, page: 'admin',
      });
    } catch (_) {}
    return res.status(200).json({ ok: true, email });
  }

  const password = generatePassword();

  const { data: updated, error } = await supabaseAdmin.auth.admin.updateUserById(student_id, { password });
  if (error) return res.status(500).json({ error: error.message });

  // Force must_change_pw = true so student is prompted on next login
  await supabaseAdmin.from('profiles').update({ must_change_pw: true }).eq('id', student_id);

  try {
    await supabaseAdmin.from('security_events').insert({
      student_id: user.id, student_name: user.email,
      event_type: 'admin_action', detail: `Reset password for ${student_id}`, page: 'admin',
    });
  } catch (_) {}

  return res.status(200).json({ password, email: updated?.user?.email || null });
}
