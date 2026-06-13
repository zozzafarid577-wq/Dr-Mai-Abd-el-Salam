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

// Resolve the Brevo key by name or by its "xkeysib-" signature (so it works
// no matter what the Vercel env var was named). Returns '' if not found.
function resolveBrevoKey() {
  let key = (process.env.BREVO_API_KEY || '').trim();
  if (!key) {
    for (const v of Object.values(process.env)) {
      if (typeof v === 'string' && v.trim().startsWith('xkeysib-')) { key = v.trim(); break; }
    }
  }
  return key;
}

async function sendBrevoEmail(key, { toEmail, toName, subject, html }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'gihanfarid23@gmail.com';
  const senderName  = process.env.BREVO_SENDER_NAME  || 'Dr Mai Portal';
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail, name: toName }],
      subject,
      htmlContent: html,
    }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body?.message || JSON.stringify(body));
  return body.messageId;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Email providers we can't reliably deliver to — students on these are asked
// to switch to a Gmail address instead of being sent credentials.
function isUnsupportedEmail(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase() || '';
  return domain.includes('yahoo') || domain.includes('hotmail');
}

function generatePassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const pw = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = pw.length; i < length; i++) pw.push(all[Math.floor(Math.random() * all.length)]);
  return pw.sort(() => Math.random() - 0.5).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  if (req.body?.action === 'evaluation')  return sendEvaluations(req, res, user);
  if (req.body?.action === 'credentials') return sendCredentials(req, res, user);
  if (req.body?.action === 'bulk_logins') return sendBulkLogins(req, res, user);
  return sendTestResult(req, res, user);
}

// ── Admin emails login credentials to a student or another admin ──
async function sendCredentials(req, res, user) {
  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { to_email, to_name, password, login_url } = req.body;
  if (!to_email || !password) return res.status(400).json({ error: 'to_email and password are required' });

  const key = resolveBrevoKey();
  if (!key) return res.status(500).json({ error: 'No Brevo API key found (set BREVO_API_KEY in Vercel).' });

  const url = login_url || 'https://dr-mai-abd-el-salam.vercel.app/login.html';
  const html = credentialsHtml({ to_name, to_email, password, url });

  try {
    await sendBrevoEmail(key, { toEmail: to_email, toName: to_name || to_email, subject: 'Your Dr Mai Portal login details', html });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  return res.status(200).json({ sent: true });
}

function credentialsHtml({ to_name, to_email, password, url }) {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0d1117;background:#f4f6fb">
<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:22px 26px;color:#fff;margin-bottom:18px">
  <div style="font-size:1.05rem;font-weight:800">Dr Mai Abd El Salam Portal</div>
  <div style="font-size:.82rem;opacity:.8;margin-top:3px">Your login details</div>
</div>
<div style="background:#fff;border:1px solid #e4e7ef;border-radius:14px;padding:22px">
  <p style="margin:0 0 12px;font-size:.92rem">Hello ${esc(to_name || '')},</p>
  <p style="margin:0 0 14px;font-size:.88rem;color:#374151">Here are your login details for the portal:</p>
  <div style="background:#f8fafc;border:1px solid #e4e7ef;border-radius:10px;padding:14px 16px;font-size:.9rem">
    <div style="margin-bottom:6px"><strong>Email:</strong> ${esc(to_email)}</div>
    <div><strong>Password:</strong> <span style="font-family:ui-monospace,monospace">${esc(password)}</span></div>
  </div>
  <p style="margin:16px 0"><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:9px;font-size:.88rem">Sign in</a></p>
  <p style="margin:0;font-size:.78rem;color:#8896ab">Please change your password after your first login.</p>
</div>
</body></html>`;
}

// Sent to students whose email is on an unsupported provider (Yahoo/Hotmail):
// we can't reliably deliver portal mail there, so ask them to switch to Gmail.
function changeEmailHtml(to_name) {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0d1117;background:#f4f6fb">
<div style="background:linear-gradient(135deg,#b45309,#d97706);border-radius:14px;padding:22px 26px;color:#fff;margin-bottom:18px">
  <div style="font-size:1.05rem;font-weight:800">Dr Mai Abd El Salam Portal</div>
  <div style="font-size:.82rem;opacity:.85;margin-top:3px">Action needed — update your email</div>
</div>
<div style="background:#fff;border:1px solid #e4e7ef;border-radius:14px;padding:22px">
  <p style="margin:0 0 12px;font-size:.92rem">Hello ${esc(to_name || '')},</p>
  <p style="margin:0 0 14px;font-size:.88rem;color:#374151">We tried to send your portal login details, but we're unable to reliably deliver email to Yahoo or Hotmail addresses.</p>
  <p style="margin:0 0 14px;font-size:.88rem;color:#374151"><strong>Please reply to us with a Gmail address</strong> (or let us know in class) so we can update your account and send you your login details.</p>
  <p style="margin:0;font-size:.78rem;color:#8896ab">Thank you — Dr Mai's Student Portal team.</p>
</div>
</body></html>`;
}

// ── Admin bulk-emails login credentials to a batch of students ──
// For each student we look up their auth email. Students on an unsupported
// provider (Yahoo/Hotmail) are emailed a "please switch to Gmail" notice
// instead of having their password reset. Everyone else gets a fresh
// password and their login details. The client sends small batches of IDs
// so a long roster never trips the serverless timeout.
async function sendBulkLogins(req, res, user) {
  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const key = resolveBrevoKey();
  if (!key) return res.status(500).json({ error: 'No Brevo API key found (set BREVO_API_KEY in Vercel).' });

  const ids = Array.isArray(req.body?.student_ids) ? req.body.student_ids.filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'student_ids (array) is required' });
  if (ids.length > 12) return res.status(400).json({ error: 'Send at most 12 students per request.' });

  const loginUrl = req.body?.login_url || 'https://dr-mai-abd-el-salam.vercel.app/login.html';

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles').select('id, full_name, is_owner').in('id', ids);
  if (error) return res.status(500).json({ error: error.message });
  const byId = new Map((profiles || []).map((p) => [p.id, p]));

  const results = [];
  for (const id of ids) {
    const prof = byId.get(id);
    const name = prof?.full_name || 'student';
    try {
      if (!prof) { results.push({ id, name, status: 'failed', error: 'Student not found' }); continue; }
      if (prof.is_owner) { results.push({ id, name, status: 'skipped', error: 'Owner account' }); continue; }

      const { data: u, error: getErr } = await supabaseAdmin.auth.admin.getUserById(id);
      if (getErr) throw new Error(getErr.message);
      const email = u?.user?.email;
      if (!email) { results.push({ id, name, status: 'failed', error: 'No email on file' }); continue; }

      if (isUnsupportedEmail(email)) {
        await sendBrevoEmail(key, {
          toEmail: email, toName: name,
          subject: 'Please update your email address — Dr Mai Portal',
          html: changeEmailHtml(name),
        });
        results.push({ id, name, email, status: 'notice' });
        continue;
      }

      const password = generatePassword();
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (updErr) throw new Error(updErr.message);
      await supabaseAdmin.from('profiles').update({ must_change_pw: true }).eq('id', id);
      await sendBrevoEmail(key, {
        toEmail: email, toName: name,
        subject: 'Your Dr Mai Portal login details',
        html: credentialsHtml({ to_name: name, to_email: email, password, url: loginUrl }),
      });
      results.push({ id, name, email, status: 'sent' });
    } catch (e) {
      results.push({ id, name, status: 'failed', error: e.message });
    }
  }

  const tally = (s) => results.filter((r) => r.status === s).length;
  return res.status(200).json({
    sent: tally('sent'), notice: tally('notice'),
    skipped: tally('skipped'), failed: tally('failed'),
    results,
  });
}

// ── Existing flow: a student finishing a test emails their own parent ──
async function sendTestResult(req, res, user) {
  const { test_title, score, max_score, percentage, passed } = req.body;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from('profiles').select('full_name, parent_email').eq('id', user.id).single();
  if (profErr) return res.status(500).json({ error: 'Could not load profile: ' + profErr.message });
  if (!prof?.parent_email) return res.status(200).json({ skipped: true });

  const key = resolveBrevoKey();
  if (!key) return res.status(500).json({ error: 'No Brevo API key found (set BREVO_API_KEY in Vercel).' });

  const studentName = prof.full_name || 'Your child';
  const title = test_title || 'a test';
  const passedColor = passed ? '#059669' : '#dc2626';
  const passedText  = passed ? 'Passed ✓' : 'Did Not Pass';
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#0d1117;background:#f4f6fb">
<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:24px 28px;color:#fff;margin-bottom:20px">
  <div style="font-size:1.05rem;font-weight:800">Dr. Mai Student Portal</div>
  <div style="font-size:.82rem;opacity:.75;margin-top:3px">Test Result Notification</div>
</div>
<div style="background:#fff;border:1px solid #e4e7ef;border-radius:14px;padding:24px;margin-bottom:14px">
  <p style="margin:0 0 10px;font-size:.93rem;color:#374151">Dear Parent / Guardian,</p>
  <p style="margin:0 0 20px;font-size:.93rem;color:#374151"><strong>${esc(studentName)}</strong> has just completed a test:</p>
  <div style="text-align:center;background:#f4f6fb;border-radius:12px;padding:28px 20px">
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8896ab;margin-bottom:10px">${esc(title)}</div>
    <div style="font-size:3.4rem;font-weight:900;color:#2563eb;line-height:1;letter-spacing:-.03em">${esc(percentage)}%</div>
    <div style="font-size:.88rem;color:#6b7280;margin-top:8px">${esc(score)} out of ${esc(max_score)} correct</div>
    <div style="display:inline-block;background:${passedColor};color:#fff;padding:6px 20px;border-radius:20px;font-size:.82rem;font-weight:700;margin-top:16px;letter-spacing:.03em">${passedText}</div>
  </div>
</div>
<p style="font-size:.76rem;color:#9ca3af;margin:0;text-align:center">Automated message from Dr. Mai's Student Portal — please do not reply.</p>
</body></html>`;

  try {
    const messageId = await sendBrevoEmail(key, {
      toEmail: prof.parent_email, toName: 'Parent of ' + studentName,
      subject: `${studentName} scored ${percentage}% on "${title}"`, html,
    });
    return res.status(200).json({ sent: true, messageId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── New flow: an admin emails a progress evaluation to one or all parents ──
async function sendEvaluations(req, res, user) {
  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const key = resolveBrevoKey();
  if (!key) return res.status(500).json({ error: 'No Brevo API key found (set BREVO_API_KEY in Vercel).' });

  const { student_id, all } = req.body;
  if (!student_id && !all) return res.status(400).json({ error: 'Provide student_id or all:true' });

  // Resolve the target students.
  let students;
  if (all) {
    const { data, error } = await supabaseAdmin
      .from('profiles').select('id, full_name, parent_email').eq('role', 'student').eq('is_active', true);
    if (error) return res.status(500).json({ error: error.message });
    students = data || [];
  } else {
    const { data, error } = await supabaseAdmin
      .from('profiles').select('id, full_name, parent_email').eq('id', student_id).single();
    if (error || !data) return res.status(404).json({ error: 'Student not found' });
    students = [data];
  }

  const withParent = students.filter((s) => s.parent_email);
  const skippedNoParent = students.length - withParent.length;

  const results = await Promise.allSettled(
    withParent.map((s) => sendOneEvaluation(key, s))
  );
  const sent   = results.filter((r) => r.status === 'fulfilled' && r.value === 'sent').length;
  const skipped = skippedNoParent + results.filter((r) => r.status === 'fulfilled' && r.value === 'skipped').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return res.status(200).json({ sent, skipped, failed, total: students.length });
}

async function sendOneEvaluation(key, student) {
  const { data: attempts } = await supabaseAdmin
    .from('test_attempts')
    .select('percentage, passed, completed_at, practice_tests(title)')
    .eq('student_id', student.id)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });

  const list = attempts || [];
  const count = list.length;
  const avg = count ? Math.round(list.reduce((s, a) => s + parseFloat(a.percentage || 0), 0) / count) : null;
  const passes = list.filter((a) => a.passed).length;
  const best = count ? Math.round(Math.max(...list.map((a) => parseFloat(a.percentage || 0)))) : null;

  const html = evaluationHtml(student.full_name || 'Your child', { count, avg, passes, best }, list.slice(0, 6));
  await sendBrevoEmail(key, {
    toEmail: student.parent_email,
    toName: 'Parent of ' + (student.full_name || 'student'),
    subject: `Progress update for ${student.full_name || 'your child'}`,
    html,
  });
  return 'sent';
}

function evaluationHtml(name, stats, recent) {
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const stat = (n, label, color) =>
    `<td style="text-align:center;padding:6px"><div style="font-size:1.6rem;font-weight:900;color:${color};line-height:1">${n}</div><div style="font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;color:#8896ab;margin-top:4px">${label}</div></td>`;

  const rows = recent.length
    ? recent.map((a) => `<tr>
        <td style="padding:8px 10px;font-size:.82rem;color:#374151;border-top:1px solid #eef1f6">${esc(a.practice_tests?.title || 'Test')}</td>
        <td style="padding:8px 10px;font-size:.82rem;font-weight:700;color:#2563eb;border-top:1px solid #eef1f6;text-align:right">${Math.round(parseFloat(a.percentage || 0))}%</td>
        <td style="padding:8px 10px;font-size:.72rem;border-top:1px solid #eef1f6;text-align:right;color:${a.passed ? '#059669' : '#dc2626'};font-weight:700">${a.passed ? 'Pass' : 'Fail'}</td>
        <td style="padding:8px 10px;font-size:.74rem;color:#8896ab;border-top:1px solid #eef1f6;text-align:right">${fmtDate(a.completed_at)}</td>
      </tr>`).join('')
    : `<tr><td style="padding:14px 10px;font-size:.82rem;color:#8896ab;text-align:center">No tests completed yet.</td></tr>`;

  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0d1117;background:#f4f6fb">
<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:24px 28px;color:#fff;margin-bottom:20px">
  <div style="font-size:1.05rem;font-weight:800">Dr. Mai Student Portal</div>
  <div style="font-size:.82rem;opacity:.75;margin-top:3px">Progress Evaluation</div>
</div>
<div style="background:#fff;border:1px solid #e4e7ef;border-radius:14px;padding:24px;margin-bottom:14px">
  <p style="margin:0 0 6px;font-size:.93rem;color:#374151">Dear Parent / Guardian,</p>
  <p style="margin:0 0 18px;font-size:.93rem;color:#374151">Here is a summary of <strong>${esc(name)}</strong>'s progress so far.</p>
  <table style="width:100%;background:#f4f6fb;border-radius:12px;margin-bottom:18px"><tr>
    ${stat(stats.count, 'Tests Taken', '#2563eb')}
    ${stat(stats.avg != null ? stats.avg + '%' : '—', 'Average', '#7c3aed')}
    ${stat(stats.best != null ? stats.best + '%' : '—', 'Best', '#059669')}
    ${stat(stats.count ? stats.passes + '/' + stats.count : '—', 'Passed', '#ea580c')}
  </tr></table>
  <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8896ab;margin-bottom:6px">Recent Results</div>
  <table style="width:100%;border-collapse:collapse">${rows}</table>
</div>
<p style="font-size:.76rem;color:#9ca3af;margin:0;text-align:center">Automated message from Dr. Mai's Student Portal — please do not reply.</p>
</body></html>`;
}
