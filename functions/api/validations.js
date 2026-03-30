// GROUND Signal — validations.js v5
// GET /api/validations?slug=X
// Returns validations + assessment state + SCI + dimension averages + synthesis

export async function onRequestGet({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  };

  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug') || url.searchParams.get('articleId') || url.searchParams.get('article') || '';

    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug parameter required' }), { status: 400, headers });
    }

    const kvKey = `validations:${slug}`;
    const raw = await env.VALIDATIONS.get(kvKey);

    if (!raw) {
      return new Response(JSON.stringify({
        validations: [],
        assessmentState: 'UNREVIEWED',
        computedSCI: null,
        dimensionAverages: {},
        synthesis: null
      }), { status: 200, headers });
    }

    let kvData;
    try {
      kvData = JSON.parse(raw);
    } catch(e) {
      return new Response(JSON.stringify({ validations: [], assessmentState: 'UNREVIEWED', computedSCI: null }), { status: 200, headers });
    }

    // Ensure all fields are present
    const response = {
      validations: kvData.validations || [],
      assessmentState: kvData.assessmentState || (kvData.validations?.length >= 2 ? 'PEER_REVIEWED' : kvData.validations?.length === 1 ? 'VALIDATED' : 'UNREVIEWED'),
      computedSCI: kvData.computedSCI || null,
      dimensionAverages: kvData.dimensionAverages || {},
      synthesis: kvData.synthesis || null
    };

    return new Response(JSON.stringify(response), { status: 200, headers });

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
