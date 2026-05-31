// Sends a test score email to a student's parent via Brevo (formerly Sendinblue).
// Requires: BREVO_API_KEY env var
// Optional: BREVO_SENDER_EMAIL (defaults to noreply@yourdomain.com) and BREVO_SENDER_NAME
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { parentEmail, studentName, testTitle, score, total, percentage, testType, passed } = req.body;
  if (!parentEmail) return res.status(200).json({ skipped: 'no parent email' });

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY not configured' });

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@drmai.com';
  const senderName  = process.env.BREVO_SENDER_NAME  || 'Dr. Mai Portal';
  const typeLabel   = testType === 'mock' ? 'Mock Test' : 'Practice Test';
  const badgeColor  = passed ? '#059669' : '#dc2626';
  const badgeText   = passed ? 'Passed ✓' : 'Did Not Pass';

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#0d1117;background:#f4f6fb">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:24px 28px;color:#fff;margin-bottom:20px">
    <div style="font-size:1.05rem;font-weight:800">Dr. Mai Student Portal</div>
    <div style="font-size:.82rem;opacity:.75;margin-top:3px">Test Result Notification</div>
  </div>

  <div style="background:#fff;border:1px solid #e4e7ef;border-radius:14px;padding:24px;margin-bottom:14px">
    <p style="margin:0 0 10px;font-size:.93rem;color:#374151">Dear Parent / Guardian,</p>
    <p style="margin:0 0 20px;font-size:.93rem;color:#374151"><strong>${studentName}</strong> has just completed a <strong>${typeLabel}</strong>:</p>

    <div style="text-align:center;background:#f4f6fb;border-radius:12px;padding:28px 20px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8896ab;margin-bottom:10px">${testTitle}</div>
      <div style="font-size:3.4rem;font-weight:900;color:#2563eb;line-height:1;letter-spacing:-.03em">${percentage}%</div>
      <div style="font-size:.88rem;color:#6b7280;margin-top:8px">${score} out of ${total} correct</div>
      <div style="display:inline-block;background:${badgeColor};color:#fff;padding:6px 20px;border-radius:20px;font-size:.82rem;font-weight:700;margin-top:16px;letter-spacing:.03em">${badgeText}</div>
    </div>
  </div>

  <p style="font-size:.76rem;color:#9ca3af;margin:0;text-align:center">Automated message from Dr. Mai's Student Portal — please do not reply.</p>
</body></html>`;

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: senderName, email: senderEmail },
      to:          [{ email: parentEmail }],
      subject:     `${studentName} scored ${percentage}% on ${testTitle}`,
      htmlContent: html,
    }),
  });

  const result = await resp.json();
  if (!resp.ok) return res.status(500).json({ error: result.message || 'Email failed' });
  return res.status(200).json({ success: true, messageId: result.messageId });
}
