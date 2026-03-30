import { getSession } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  try {
    const user = await getSession(request, env);
    if (!user) {
      return Response.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, titleOrg, note, fromName } = body;

    if (!name || !email) {
      return Response.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    // Send invite email to the recommended person
    const signupUrl = 'https://ground.in-kluso.com/signup/';
    const inviteHtml = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:system-ui,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#1a1a2e;border-radius:8px;overflow:hidden;">
  <div style="background:#2D6BE4;padding:24px 32px;">
    <div style="color:white;font-size:20px;font-weight:700;letter-spacing:0.05em;">GROUND <span style="opacity:0.6;font-weight:400;">by IN·KluSo</span></div>
    <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">Professional Intelligence Platform</div>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#ffffff;margin:0 0 16px;font-size:22px;">You've been invited to GROUND</h2>
    <p style="color:#a0a0b8;line-height:1.6;margin:0 0 16px;">
      <strong style="color:#e8e6df;">${fromName}</strong> thinks your professional perspective would add real value to GROUND — our platform where industry professionals validate AI-generated intelligence signals.
    </p>
    ${note ? `<div style="background:#111128;border-left:3px solid #2D6BE4;padding:14px 18px;margin:0 0 24px;border-radius:0 4px 4px 0;">
      <p style="color:#c0bfb8;margin:0;font-style:italic;font-size:14px;line-height:1.6;">"${note}"</p>
      <p style="color:#666680;font-size:12px;margin:8px 0 0;">— ${fromName}</p>
    </div>` : ''}
    <p style="color:#a0a0b8;line-height:1.6;margin:0 0 24px;">As a validated contributor, your expertise gets attached to published intelligence across real estate, retail, brand, food & agriculture, and family & education.</p>
    <a href="${signupUrl}" style="display:inline-block;background:#2D6BE4;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Join GROUND →</a>
    <p style="color:#666680;font-size:13px;margin:24px 0 0;">Free to join. Your credentials stay with your validations permanently.</p>
  </div>
</div>
</body>
</html>`;

    // Send invite to the recommended person
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GROUND by IN·KluSo <noreply@in-kluso.com>',
        to: [email],
        subject: `${fromName} invited you to validate on GROUND`,
        html: inviteHtml
      })
    });

    // Also notify Juan
    const notifyHtml = `<p>New recommendation from ${fromName}:</p>
<ul>
<li><strong>Name:</strong> ${name}</li>
<li><strong>Email:</strong> ${email}</li>
${titleOrg ? `<li><strong>Title/Org:</strong> ${titleOrg}</li>` : ''}
${note ? `<li><strong>Note:</strong> ${note}</li>` : ''}
</ul>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GROUND by IN·KluSo <noreply@in-kluso.com>',
        to: ['jjaecheverri@gmail.com'],
        subject: `GROUND: ${fromName} recommended ${name}`,
        html: notifyHtml
      })
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
}
