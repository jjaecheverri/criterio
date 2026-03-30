import { getSession } from './_helpers.js';

export async function onRequest({ request, env }) {
  const user = await getSession(request, env);
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  const activity = await env.VALIDATIONS.get(`activity:${user.email}`, { type: 'json' }) || [];
  return Response.json({ activity });
}
