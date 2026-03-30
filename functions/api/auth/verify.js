import { sessionCookie } from './_helpers.js';

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return Response.redirect('https://ground.in-kluso.com/login/?error=invalid_token', 302);
  }

  const verifyData = await env.VALIDATIONS.get(`verify:${token}`, { type: 'json' });
  if (!verifyData) {
    return Response.redirect('https://ground.in-kluso.com/login/?error=expired_token', 302);
  }
  if (new Date(verifyData.expires) < new Date()) {
    await env.VALIDATIONS.delete(`verify:${token}`);
    return Response.redirect('https://ground.in-kluso.com/login/?error=expired_token', 302);
  }

  // Mark user as verified
  const user = await env.VALIDATIONS.get(`contrib:${verifyData.email}`, { type: 'json' });
  if (!user) {
    return Response.redirect('https://ground.in-kluso.com/login/?error=user_not_found', 302);
  }
  user.verified = true;
  await env.VALIDATIONS.put(`contrib:${verifyData.email}`, JSON.stringify(user));
  await env.VALIDATIONS.delete(`verify:${token}`);

  // Auto-login: create session
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await env.VALIDATIONS.put(`session:${sessionToken}`, JSON.stringify({
    email: verifyData.email,
    expires: expires.toISOString()
  }), { expirationTtl: 7 * 24 * 3600 });

  return new Response(null, {
    status: 302,
    headers: {
      'Location': 'https://ground.in-kluso.com/dashboard/?verified=1',
      'Set-Cookie': sessionCookie(sessionToken, expires)
    }
  });
}
