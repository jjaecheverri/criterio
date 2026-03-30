import { verifyPassword, sessionCookie } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    const emailLower = email.toLowerCase().trim();
    const user = await env.VALIDATIONS.get(`contrib:${emailLower}`, { type: 'json' });
    if (!user) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    if (!user.verified) {
      return Response.json({ error: 'Please verify your email before logging in. Check your inbox.' }, { status: 403 });
    }
    const valid = await verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Create session
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.VALIDATIONS.put(`session:${sessionToken}`, JSON.stringify({
      email: emailLower,
      expires: expires.toISOString()
    }), { expirationTtl: 7 * 24 * 3600 });

    const { passwordHash, salt, ...publicUser } = user;
    return new Response(JSON.stringify({ success: true, user: publicUser }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(sessionToken, expires)
      }
    });
  } catch (err) {
    return Response.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
}
