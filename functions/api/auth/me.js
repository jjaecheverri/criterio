import { getSession } from './_helpers.js';

// Determine credential tier based on profile
function getCredentialTier(user) {
  const years = parseInt(user.yearsExperience) || 0;
  const hasOrg = !!(user.organization || user.org);
  const hasTitle = !!user.title;
  const validations = user.validationCount || 0;

  if (years >= 10 && hasOrg && hasTitle && validations >= 5) return 'validator';
  if (years >= 3 && hasOrg && hasTitle) return 'reviewer';
  return 'reader';
}

export async function onRequest({ request, env }) {
  const user = await getSession(request, env);
  if (!user) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  // Strip sensitive fields
  const { passwordHash, salt, verificationToken, ...publicUser } = user;

  // Compute levels
  const validationCount = publicUser.validationCount || 0;
  let level = 1, levelName = 'Signal Watcher', nextLevel = 1, nextThreshold = 1;

  if (validationCount >= 30) { level = 5; levelName = 'GROUND Expert'; nextLevel = 5; nextThreshold = 30; }
  else if (validationCount >= 15) { level = 4; levelName = 'Principal'; nextLevel = 5; nextThreshold = 30; }
  else if (validationCount >= 5) { level = 3; levelName = 'Senior Analyst'; nextLevel = 4; nextThreshold = 15; }
  else if (validationCount >= 1) { level = 2; levelName = 'Field Analyst'; nextLevel = 3; nextThreshold = 5; }
  else { level = 1; levelName = 'Signal Watcher'; nextLevel = 2; nextThreshold = 1; }

  const credentialTier = getCredentialTier(publicUser);

  return Response.json({
    authenticated: true,
    user: {
      ...publicUser,
      level,
      levelName,
      nextLevel,
      nextThreshold,
      validationCount,
      credentialTier
    }
  });
}
