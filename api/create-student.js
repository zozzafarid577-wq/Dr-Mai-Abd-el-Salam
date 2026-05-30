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

  // Verify admin token
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

  const { full_name, email, phone, course_ids = [] } = req.body;
  if (!full_name || !email) return res.status(400).json({ error: 'full_name and email are required' });

  const password = generatePassword();

  // Create auth user
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'student' },
  });

  if (createErr) return res.status(400).json({ error: createErr.message });

  const uid = created.user.id;

  // Insert profile
  const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
    id: uid,
    full_name,
    phone: phone || null,
    role: 'student',
    is_active: true,
    must_change_pw: true,
  });

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(uid);
    return res.status(500).json({ error: profileErr.message });
  }

  // Enroll in courses
  if (course_ids.length > 0) {
    const enrollments = course_ids.map(course_id => ({ student_id: uid, course_id }));
    await supabaseAdmin.from('enrollments').insert(enrollments);
  }

  return res.status(200).json({ password });
}
