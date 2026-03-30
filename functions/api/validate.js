// Cloudflare Pages Function: /api/validate
// Generates AI validation commentary via Anthropic and saves to KV
// Requires authentication

import { getSession } from './auth/_helpers.js';

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    // Auth check
    const user = await getSession(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: corsHeaders });
    }

    const body = await request.json();
    const { articleBody, articleTitle, currentLevel, articleId, criterio } = body;

    if (!articleBody || !criterio || !articleId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    // Use authenticated user's profile data (server-side, cannot be spoofed)
    const validatorName = user.name;
    const validatorTitle = user.title;
    const validatorOrg = user.org;
    const validatorYears = user.yearsExp;

    // Call Anthropic to generate structured validation commentary
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `You are the Criterio validation engine. A professional practitioner has reviewed a research article and submitted their expert validation (called "criterio"). Generate a concise, structured validation commentary — not a full article rewrite.

RULES:
- Write 3-5 sentences of professional validation commentary
- Reference specific claims from the article that the professional confirms, corrects, or expands
- Be direct, data-forward, institutional in tone
- Do NOT use markdown or HTML — plain text paragraphs only
- Do NOT introduce yourself or explain what you're doing

ARTICLE TITLE: ${articleTitle || articleId}
ARTICLE EXCERPT (first 800 chars): ${articleBody.substring(0, 800)}

PROFESSIONAL PROFILE:
- Name: ${validatorName}
- Title: ${validatorTitle}
- Organization: ${validatorOrg || 'N/A'}
- Years of experience: ${validatorYears}

THEIR CRITERIO (validation input):
${criterio}

Generate the validation commentary now.`
        }]
      })
    });

    const aiData = await anthropicResponse.json();
    const aiCommentary = aiData?.content?.[0]?.text || '';

    // Build validation object
    const validation = {
      id: `val_${Date.now()}`,
      articleId,
      validatorName,
      validatorTitle,
      validatorOrg,
      validatorYears,
      criterio,
      aiCommentary,
      timestamp: new Date().toISOString(),
      level: currentLevel || 1
    };

    // Save to KV — key: `validations:{articleId}`
    if (env.VALIDATIONS) {
      const slug = articleId;
      const existing = await env.VALIDATIONS.get(`validations:${slug}`);
      const list = existing ? JSON.parse(existing) : [];
      list.push(validation);
      await env.VALIDATIONS.put(`validations:${slug}`, JSON.stringify(list));

      // Update activity log for this contributor
      const activityKey = `activity:${user.email}`;
      let activity = await env.VALIDATIONS.get(activityKey, { type: 'json' }) || [];
      activity.unshift({ slug, title: articleTitle || slug, timestamp: new Date().toISOString() });
      if (activity.length > 50) activity = activity.slice(0, 50);
      await env.VALIDATIONS.put(activityKey, JSON.stringify(activity));
    }

    return new Response(JSON.stringify({ success: true, validation }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
