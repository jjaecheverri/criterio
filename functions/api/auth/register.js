import { hashPassword } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { email, password, name, title, org, yearsExp } = body;

    if (!email || !password || !name || !title || !org || !yearsExp) {
      return Response.json({ error: 'All fields are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    const emailLower = email.toLowerCase().trim();

    const existing = await env.VALIDATIONS.get(`contrib:${emailLower}`);
    if (existing) {
      return Response.json({ error: 'This email is already registered.' }, { status: 409 });
    }

    const { hash, salt } = await hashPassword(password);
    const user = {
      email: emailLower,
      name: name.trim(),
      title: title.trim(),
      org: org.trim(),
      yearsExp: yearsExp.toString().trim(),
      passwordHash: hash,
      salt,
      verified: false,
      createdAt: new Date().toISOString()
    };
    await env.VALIDATIONS.put(`contrib:${emailLower}`, JSON.stringify(user));

    // Verification token
    const token = crypto.randomUUID();
    await env.VALIDATIONS.put(`verify:${token}`, JSON.stringify({
      email: emailLower,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }), { expirationTtl: 86400 });

    // Send verification email
    const verifyUrl = `https://ground.in-kluso.com/verify/?token=${token}`;
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'GROUND by IN·KluSo <noreply@in-kluso.com>',
          to: [emailLower],
          subject: 'Verify your GROUND contributor account',
          html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:system-ui,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#1a1a2e;border-radius:8px;overflow:hidden;">
  <div style="background:#2D6BE4;padding:24px 32px;">
    <div style="color:white;font-size:20px;font-weight:700;letter-spacing:0.05em;">GROUND <span style="opacity:0.6;font-weight:400;">by IN·KluSo</span></div>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#ffffff;margin:0 0 16px;font-size:22px;">Welcome, ${user.name}</h2>
    <p style="color:#a0a0b8;line-height:1.6;margin:0 0 24px;">You've registered as a GROUND contributor. Click the button below to verify your email and activate your account.</p>
    <a href="${verifyUrl}" style="display:inline-block;background:#2D6BE4;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Verify Email Address</a>
    <p style="color:#666680;font-size:13px;margin:24px 0 0;">This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
  </div>
</div>
</body>
</html>`
        })
      });
      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error('Resend error:', errBody);
      }
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    return Response.json({ success: true, message: 'Account created! Check your email to verify your account.' });
  } catch (err) {
    return Response.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
}
