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

  // Verify student token
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { test_title, score, max_score, percentage, passed } = req.body;

  // Look up student name + parent email using service role (bypasses RLS)
  const { data: prof, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('full_name, parent_email, parent_phone')
    .eq('id', user.id)
    .single();

  if (profErr) return res.status(500).json({ error: 'Could not load profile: ' + profErr.message });
  if (!prof?.parent_email) return res.status(200).json({ skipped: true });

  // Find the Brevo key by name, OR by its value signature (Brevo keys start with "xkeysib-")
  // so it works no matter what the Vercel env var was named.
  let BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
  if (!BREVO_API_KEY) {
    for (const v of Object.values(process.env)) {
      if (typeof v === 'string' && v.trim().startsWith('xkeysib-')) { BREVO_API_KEY = v.trim(); break; }
    }
  }
  if (!BREVO_API_KEY) {
    const SYS = /^(VERCEL|AWS|LAMBDA|NODE|PATH|PWD|HOME|LANG|TZ|HOSTNAME|SHLVL|TERM|NOW_REGION|_|__|X_|LC_|EDGE_)/i;
    const names = Object.keys(process.env).filter(k => !SYS.test(k)).sort();
    return res.status(500).json({
      error: 'No Brevo API key found (looked for any var named BREVO_API_KEY or any value starting with "xkeysib-"). '
        + 'Custom env var names this deployment can see: [' + (names.join(', ') || 'NONE') + '] '
        + '[build ' + (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7) + ']'
    });
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'gihanfarid23@gmail.com';
  const senderName  = process.env.BREVO_SENDER_NAME  || 'Dr Mai Portal';
  const passedColor = passed ? '#059669' : '#dc2626';
  const passedText  = passed ? 'Passed ✓' : 'Did Not Pass';
  const title       = test_title || 'a test';
  const studentName = prof.full_name || 'Your child';

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#0d1117;background:#f4f6fb">
<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:24px 28px;color:#fff;margin-bottom:20px">
  <div style="font-size:1.05rem;font-weight:800">Dr. Mai Student Portal</div>
  <div style="font-size:.82rem;opacity:.75;margin-top:3px">Test Result Notification</div>
</div>
<div style="background:#fff;border:1px solid #e4e7ef;border-radius:14px;padding:24px;margin-bottom:14px">
  <p style="margin:0 0 10px;font-size:.93rem;color:#374151">Dear Parent / Guardian,</p>
  <p style="margin:0 0 20px;font-size:.93rem;color:#374151"><strong>${studentName}</strong> has just completed a test:</p>
  <div style="text-align:center;background:#f4f6fb;border-radius:12px;padding:28px 20px">
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8896ab;margin-bottom:10px">${title}</div>
    <div style="font-size:3.4rem;font-weight:900;color:#2563eb;line-height:1;letter-spacing:-.03em">${percentage}%</div>
    <div style="font-size:.88rem;color:#6b7280;margin-top:8px">${score} out of ${max_score} correct</div>
    <div style="display:inline-block;background:${passedColor};color:#fff;padding:6px 20px;border-radius:20px;font-size:.82rem;font-weight:700;margin-top:16px;letter-spacing:.03em">${passedText}</div>
  </div>
</div>
<p style="font-size:.76rem;color:#9ca3af;margin:0;text-align:center">Automated message from Dr. Mai's Student Portal — please do not reply.</p>
</body></html>`;

  let brevoResp, brevoBody;
  try {
    brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender:      { name: senderName, email: senderEmail },
        to:          [{ email: prof.parent_email, name: 'Parent of ' + studentName }],
        subject:     `${studentName} scored ${percentage}% on "${title}"`,
        htmlContent: html,
      }),
    });
    brevoBody = await brevoResp.json();
  } catch (e) {
    return res.status(500).json({ error: 'Network error reaching Brevo: ' + e.message });
  }

  if (!brevoResp.ok) {
    return res.status(500).json({ error: brevoBody?.message || JSON.stringify(brevoBody) });
  }

  return res.status(200).json({ sent: true, messageId: brevoBody.messageId });
}
