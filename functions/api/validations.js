// Cloudflare Pages Function: /api/validations
// Returns all validations + synthesis for a given article.

export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const url = new URL(request.url);
    // Accept both ?slug= (from review-mode.js) and ?articleId= (legacy)
    const articleId = url.searchParams.get('slug') || url.searchParams.get('articleId');

    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Missing slug or articleId' }), { status: 400, headers: corsHeaders });
    }

    if (!env.VALIDATIONS) {
      return new Response(JSON.stringify({ validations: [], synthesis: null }), { headers: corsHeaders });
    }

    const [validationsData, synthesisData] = await Promise.all([
      env.VALIDATIONS.get(`validations:${articleId}`),
      env.VALIDATIONS.get(`synthesis:${articleId}`)
    ]);

    const validations = validationsData ? JSON.parse(validationsData) : [];
    const synthesis   = synthesisData  ? JSON.parse(synthesisData)   : null;

    return new Response(JSON.stringify({ validations, synthesis }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
