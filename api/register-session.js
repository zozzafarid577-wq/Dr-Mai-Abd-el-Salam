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
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  // Only enforce single-session for students (admins can have multiple)
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role, full_name, session_token').eq('id', user.id).single();
  if (!profile || profile.role !== 'student') return res.status(200).json({ session_token: null });

  // Capture where/when this login came from (best-effort).
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
           || req.socket?.remoteAddress || null;
  const ua = (req.headers['user-agent'] || '').slice(0, 300) || null;

  // If a session token already exists, this login is from a SECOND device
  // while another is still active — flag it so the admin is notified.
  if (profile.session_token) {
    try {
      await supabaseAdmin.from('security_events').insert({
        student_id: user.id,
        student_name: profile.full_name,
        event_type: 'multi_device',
        detail: `New sign-in from a different device${ip ? ' · IP ' + ip : ''}. The previous device was signed out.`,
        page: '/login.html',
      });
    } catch (_) {}
  }

  const sessionToken = crypto.randomUUID();
  await supabaseAdmin.from('profiles').update({
    session_token: sessionToken,
    last_login_at: new Date().toISOString(),
    last_login_ip: ip,
    last_login_ua: ua,
  }).eq('id', user.id);

  return res.status(200).json({ session_token: sessionToken });
}
