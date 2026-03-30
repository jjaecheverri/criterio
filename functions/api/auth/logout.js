import { clearCookie } from './_helpers.js';

export async function onRequestPost({ request, env }) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  if (tokenMatch) {
    await env.VALIDATIONS.delete(`session:${tokenMatch[1]}`);
  }
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie()
    }
  });
}
