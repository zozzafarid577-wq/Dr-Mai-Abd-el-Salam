// Sends a test score email to a student's parent via Resend API.
// Requires RESEND_API_KEY env var. Optional: RESEND_FROM (defaults to onboarding@resend.dev).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { parentEmail, studentName, testTitle, score, total, percentage, testType, passed } = req.body;
  if (!parentEmail) return res.status(200).json({ skipped: 'no parent email' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const typeLabel  = testType === 'mock' ? 'Mock Test' : 'Practice Test';
  const badgeColor = passed ? '#16a34a' : '#dc2626';
  const badgeText  = passed ? 'Passed ✓' : 'Did Not Pass';
  const from       = process.env.RESEND_FROM || 'Dr. Mai Portal <onboarding@resend.dev>';

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1a1a2e;background:#f8fafc">
  <div style="background:linear-gradient(135deg,#1a56db,#0e38b1);border-radius:14px;padding:24px 28px;color:#fff;margin-bottom:24px">
    <div style="font-size:1.05rem;font-weight:800;letter-spacing:-.01em">Dr. Mai Student Portal</div>
    <div style="font-size:.82rem;opacity:.8;margin-top:3px">Test Result Notification</div>
  </div>

  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:16px">
    <p style="margin:0 0 10px;font-size:.93rem;color:#334155">Dear Parent / Guardian,</p>
    <p style="margin:0 0 20px;font-size:.93rem;color:#334155"><strong>${studentName}</strong> has just completed a ${typeLabel}:</p>

    <div style="text-align:center;background:#f1f5f9;border-radius:10px;padding:24px 20px">
      <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:8px">${testTitle}</div>
      <div style="font-size:3.2rem;font-weight:900;color:#1a56db;line-height:1">${percentage}%</div>
      <div style="font-size:.88rem;color:#64748b;margin-top:6px">${score} out of ${total} correct</div>
      <div style="display:inline-block;background:${badgeColor};color:#fff;padding:5px 18px;border-radius:20px;font-size:.82rem;font-weight:700;margin-top:14px">${badgeText}</div>
    </div>
  </div>

  <p style="font-size:.78rem;color:#94a3b8;margin:0">This is an automated message from Dr. Mai's Student Portal. Please do not reply.</p>
</body></html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [parentEmail],
      subject: `${studentName} scored ${percentage}% on ${testTitle}`,
      html,
    }),
  });

  const result = await resp.json();
  if (!resp.ok) return res.status(500).json({ error: result.message || 'Email failed' });
  return res.status(200).json({ success: true, id: result.id });
}
