// Cloudflare Pages Function: /api/validations
// Returns all validations for a given article ID

export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const url = new URL(request.url);
    const articleId = url.searchParams.get('articleId');

    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Missing articleId' }), { status: 400, headers: corsHeaders });
    }

    if (!env.VALIDATIONS) {
      return new Response(JSON.stringify({ validations: [] }), { headers: corsHeaders });
    }

    const data = await env.VALIDATIONS.get(`validations:${articleId}`);
    const validations = data ? JSON.parse(data) : [];

    return new Response(JSON.stringify({ validations }), { headers: corsHeaders });

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
