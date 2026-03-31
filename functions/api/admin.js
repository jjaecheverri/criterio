// GROUND Admin API — /api/admin
// Requires authenticated session from jjaecheverri@gmail.com

const ADMIN_EMAIL = 'jjaecheverri@gmail.com';

export async function onRequestGet({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // ── Auth: require admin session ──────────────────────────────────────
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (!sessionMatch) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });
    }
    const sessionData = await env.VALIDATIONS.get(`session:${sessionMatch[1]}`, { type: 'json' });
    if (!sessionData || new Date(sessionData.expires) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401, headers });
    }
    const userEmail = sessionData.email || sessionData.contributorId;
    if (userEmail !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });
    }

    const url = new URL(request.url);
    const section = url.searchParams.get('section') || 'overview';

    // ── Fetch all users ──────────────────────────────────────────────────
    const usersData = [];
    let usersCursor = null;
    do {
      const listParams = new URLSearchParams({ prefix: 'contrib:', limit: '100' });
      if (usersCursor) listParams.set('cursor', usersCursor);
      const listRes = await env.VALIDATIONS.list({ prefix: 'contrib:', limit: 100, cursor: usersCursor });
      for (const key of listRes.keys) {
        const userData = await env.VALIDATIONS.get(key.name, { type: 'json' });
        if (userData) usersData.push(userData);
      }
      usersCursor = listRes.list_complete ? null : listRes.cursor;
    } while (usersCursor);

    // ── Fetch all validations ────────────────────────────────────────────
    const validationsData = [];
    let valCursor = null;
    do {
      const listRes = await env.VALIDATIONS.list({ prefix: 'validations:', limit: 100, cursor: valCursor });
      for (const key of listRes.keys) {
        const articleSlug = key.name.replace('validations:', '');
        const articleData = await env.VALIDATIONS.get(key.name, { type: 'json' });
        if (articleData) {
          validationsData.push({
            articleSlug,
            assessmentState: articleData.assessmentState,
            computedSCI: articleData.computedSCI,
            validationCount: (articleData.validations || []).length,
            dimensionAverages: articleData.dimensionAverages || {},
            validations: (articleData.validations || []).map(v => ({
              contributorId: v.contributorId,
              name: v.name,
              title: v.title,
              organization: v.organization,
              timestamp: v.timestamp,
              scores: v.scores,
              commentaryLength: (v.commentary || '').length,
              annotationCount: (v.paragraphNotes || []).length
            }))
          });
        }
      }
      valCursor = listRes.list_complete ? null : listRes.cursor;
    } while (valCursor);

    // ── Summary stats ────────────────────────────────────────────────────
    const totalUsers = usersData.length;
    const verifiedUsers = usersData.filter(u => u.verified).length;
    const totalValidations = usersData.reduce((sum, u) => sum + (u.validationCount || 0), 0);
    const articlesValidated = validationsData.filter(a => a.validationCount > 0).length;
    const avgSCI = validationsData.filter(a => a.computedSCI).reduce((sum, a, _, arr) => {
      return sum + a.computedSCI / arr.length;
    }, 0);

    return new Response(JSON.stringify({
      summary: {
        totalUsers,
        verifiedUsers,
        totalValidations,
        articlesValidated,
        avgSCI: avgSCI ? parseFloat(avgSCI.toFixed(3)) : null
      },
      users: usersData.sort((a, b) => (b.validationCount || 0) - (a.validationCount || 0)),
      articles: validationsData.sort((a, b) => b.validationCount - a.validationCount)
    }), { status: 200, headers });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
