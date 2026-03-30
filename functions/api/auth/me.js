import { getSession } from './_helpers.js';

export async function onRequest({ request, env }) {
  const user = await getSession(request, env);
  if (!user) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  const { passwordHash, salt, ...publicUser } = user;
  return Response.json({ authenticated: true, user: publicUser });
}
