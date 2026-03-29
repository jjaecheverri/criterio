// Cloudflare Pages Function: /api/validate
// Proxies validation requests to Anthropic API

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://criterio.in-kluso.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { articleBody, currentLevel, articleId, validatorName, validatorTitle, validatorYears, criterio } = body;

    if (!articleBody || !criterio) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are the Criterio AI revision engine. Take an existing industry research article and a professional's validation input ("criterio") and produce a revised version that stacks the new intelligence.

RULES:
- Keep same structure and tone — research-grade, data-forward, institutional
- Integrate the professional's corrections, additions, and context naturally
- Add new evidence or data points the professional provided
- Strengthen confirmed claims, correct flagged inaccuracies
- Do NOT add commentary about the revision — just produce the better article
- Return ONLY paragraphs of text separated by double newlines — no HTML, no markdown

ORIGINAL ARTICLE (Level ${currentLevel}, ID: ${articleId}):
${articleBody}

PROFESSIONAL VALIDATION (${validatorName}, ${validatorTitle}, ${validatorYears} years experience):
${criterio}

Produce the revised article. Return only paragraphs of text separated by double newlines.`
        }]
      })
    });

    const data = await anthropicResponse.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://criterio.in-kluso.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
