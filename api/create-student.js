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

// Permission keys a sub-admin can be granted. Keep in sync with the
// admin portal nav (js/auth.js → ADMIN_PERMS).
const VALID_PERMS = [
  'students', 'courses', 'questions', 'tests', 'assignments',
  'announcements', 'wayground', 'notes', 'security', 'chat',
];
function cleanPerms(perms) {
  if (!Array.isArray(perms)) return [];
  return [...new Set(perms.filter(p => VALID_PERMS.includes(p)))];
}

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

  // Verify admin: trust the JWT app_metadata first, then fall back to the
  // profiles table (keeps the profiles lookup lazy).
  let callerProfile = null;
  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data } = await supabaseAdmin
      .from('profiles').select('role, is_owner').eq('id', user.id).single();
    callerProfile = data;
    isAdmin = data?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  // ── Sub-admin management (OWNER only) ──────────────────────────
  // Reuses this endpoint to stay under Vercel's serverless-function limit.
  const adminAction = req.body?.admin_action;
  if (adminAction) {
    let isOwner = callerProfile?.is_owner;
    if (isOwner == null) {
      const { data } = await supabaseAdmin
        .from('profiles').select('is_owner').eq('id', user.id).single();
      isOwner = data?.is_owner;
    }
    if (!isOwner) {
      return res.status(403).json({ error: 'Only the main host can manage admins.' });
    }
    return handleAdminAction(adminAction, req, res, user.id);
  }

  // ── Create a student (default behaviour) ───────────────────────
  const { full_name, email, phone, parent_email, parent_phone, course_ids = [] } = req.body;
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
    parent_email: parent_email || null,
    parent_phone: parent_phone || null,
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

// Owner-only operations on sub-admins. The owner ("main host") account is
// never createable, editable, or deletable here.
async function handleAdminAction(action, req, res, callerId) {
  if (action === 'create') {
    const { full_name, email } = req.body;
    const perms = cleanPerms(req.body.perms);
    if (!full_name || !email) return res.status(400).json({ error: 'full_name and email are required' });

    const password = generatePassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });
    if (createErr) return res.status(400).json({ error: createErr.message });

    const uid = created.user.id;
    const { error: profErr } = await supabaseAdmin.from('profiles').insert({
      id: uid,
      full_name,
      role: 'admin',
      is_owner: false,
      admin_perms: perms,
      is_active: true,
      must_change_pw: true,
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      return res.status(500).json({ error: profErr.message });
    }
    return res.status(200).json({ password, id: uid });
  }

  if (action === 'update') {
    const { admin_id } = req.body;
    if (!admin_id) return res.status(400).json({ error: 'admin_id is required' });

    const { data: target } = await supabaseAdmin
      .from('profiles').select('role, is_owner').eq('id', admin_id).single();
    if (!target || target.role !== 'admin') return res.status(404).json({ error: 'Admin not found' });
    if (target.is_owner) return res.status(403).json({ error: 'The main host cannot be modified.' });

    const patch = {};
    if (Array.isArray(req.body.perms)) patch.admin_perms = cleanPerms(req.body.perms);
    if (typeof req.body.is_active === 'boolean') patch.is_active = req.body.is_active;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });

    const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', admin_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (action === 'delete') {
    const { admin_id } = req.body;
    if (!admin_id) return res.status(400).json({ error: 'admin_id is required' });
    if (admin_id === callerId) return res.status(403).json({ error: 'You cannot delete yourself.' });

    const { data: target } = await supabaseAdmin
      .from('profiles').select('role, is_owner').eq('id', admin_id).single();
    if (!target || target.role !== 'admin') return res.status(404).json({ error: 'Admin not found' });
    if (target.is_owner) return res.status(403).json({ error: 'The main host cannot be deleted.' });

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(admin_id);
    if (delErr) return res.status(500).json({ error: delErr.message });
    await supabaseAdmin.from('profiles').delete().eq('id', admin_id);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown admin_action' });
}
