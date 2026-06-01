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

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { test_title, score, max_score, percentage, passed } = req.body;

  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('full_name, parent_email')
    .eq('id', user.id)
    .single();

  if (!prof?.parent_email) return res.status(200).json({ skipped: true });

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@drmai.com';
  const senderName  = process.env.BREVO_SENDER_NAME  || 'Dr Mai Portal';
  const passedColor = passed ? '#16a34a' : '#dc2626';
  const passedText  = passed ? 'Passed ✓' : 'Not Passed ✗';
  const title       = test_title || 'a test';

  const html = `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1a56db,#0e38b1);padding:28px 32px;text-align:center">
    <h2 style="color:#fff;margin:0;font-size:1.3rem">Test Result Notification</h2>
    <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:.9rem">Dr Mai Portal</p>
  </div>
  <div style="padding:28px 32px;background:#fff">
    <p style="color:#374151;font-size:.95rem;margin:0 0 16px">Dear Parent,</p>
    <p style="color:#374151;font-size:.95rem;margin:0 0 20px">
      <strong>${prof.full_name}</strong> has just completed a test on the Dr Mai Portal.
    </p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px;margin:0 0 20px;text-align:center">
      <div style="font-size:2.5rem;font-weight:900;color:#1a56db">${percentage}%</div>
      <div style="color:#6b7280;font-size:.88rem;margin:4px 0">${score} / ${max_score} correct</div>
      <div style="display:inline-block;margin-top:10px;padding:4px 16px;border-radius:20px;background:${passedColor};color:#fff;font-size:.8rem;font-weight:700">${passedText}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <tr><td style="color:#6b7280;padding:6px 0">Test</td><td style="color:#111827;font-weight:600;text-align:right">${title}</td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Student</td><td style="color:#111827;font-weight:600;text-align:right">${prof.full_name}</td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Score</td><td style="color:#111827;font-weight:600;text-align:right">${percentage}%</td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Result</td><td style="color:${passedColor};font-weight:700;text-align:right">${passedText}</td></tr>
    </table>
  </div>
  <div style="padding:16px 32px;background:#f8fafc;text-align:center">
    <p style="color:#9ca3af;font-size:.78rem;margin:0">This is an automated message from Dr Mai Portal.</p>
  </div>
</div>`;

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: prof.parent_email }],
      subject: `${prof.full_name} scored ${percentage}% on ${title}`,
      htmlContent: html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return res.status(500).json({ error: 'Email failed: ' + errText });
  }

  return res.status(200).json({ sent: true });
}
