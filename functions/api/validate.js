// Cloudflare Pages Function: /api/validate
// Saves professional validations to KV and generates AI commentary.
// Requires authentication. Accepts payloads from Review Mode, Quick Validate.

import { getSession } from './auth/_helpers.js';

export async function onRequestPost({ request, env, ctx }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const user = await getSession(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: corsHeaders });
    }

    const body = await request.json();

    // Accept all field name variants from different submission paths:
    // Review Mode:    { articleSlug, articleTitle, commentary, paragraphNotes }
    // Quick Validate: { article, commentary, fromDashboard }
    // Legacy forms:   { articleId, criterio }
    const articleId      = body.articleSlug || body.articleId || body.article || '';
    const articleTitle   = body.articleTitle || body.title || articleId;
    const commentary     = body.commentary || body.criterio || '';
    const paragraphNotes = body.paragraphNotes || [];
    const articleBody    = body.articleBody || '';

    if (!articleId || !commentary) {
      return new Response(JSON.stringify({ error: 'Missing required fields: article and commentary.' }), { status: 400, headers: corsHeaders });
    }

    // Use authenticated user profile (server-side, cannot be spoofed)
    const validatorName  = user.name;
    const validatorTitle = user.title;
    const validatorOrg   = user.org;
    const validatorYears = user.yearsExp;

    // ── QUALITY GATE ────────────────────────────────────────────────────────
    // Must contain at least one local/specific insight.
    // Professional takes the hit if their claim turns out to be wrong —
    // we only require specificity, not correctness.
    try {
      const allText = [commentary, ...paragraphNotes.map(n => n.note || '')].join(' ');
      const qgRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `You are GROUND's validation quality gate. Review this professional commentary.

REQUIREMENT: It must contain at least ONE LOCAL or SPECIFIC insight — a concrete observation, named example, real data point, market experience, or specific claim from the field. Generic agreement ("this is accurate", "I agree", "great analysis") or purely abstract commentary without any specifics does NOT qualify.

COMMENTARY: "${allText}"

Respond ONLY with valid JSON, no extra text: {"passes": true, "feedback": "..."} or {"passes": false, "feedback": "one sentence of constructive guidance"}`
          }]
        })
      });
      const qgData = await qgRes.json();
      const qgText = qgData?.content?.[0]?.text || '{"passes":true}';
      const jsonMatch = qgText.match(/\{[^}]+\}/s);
      if (jsonMatch) {
        try {
          const qgResult = JSON.parse(jsonMatch[0]);
          if (qgResult.passes === false) {
            return new Response(JSON.stringify({
              error: 'quality_gate',
              message: qgResult.feedback || 'Your validation needs at least one specific local insight.',
              hint: 'What concrete experience, data point, or market observation does your expertise bring to this article?'
            }), { status: 400, headers: corsHeaders });
          }
        } catch (_) {}
      }
    } catch (_) {
      // Quality gate failure is non-fatal — proceed with submission
    }

    // ── Level calculation ───────────────────────────────────────────────────
    const activityKey    = `activity:${user.email}`;
    let existingActivity = await env.VALIDATIONS.get(activityKey, { type: 'json' }) || [];
    const validationCount = existingActivity.length;
    const level = validationCount >= 30 ? 5
                : validationCount >= 15 ? 4
                : validationCount >= 5  ? 3
                : validationCount >= 1  ? 2
                : 1;

    // ── AI Commentary ───────────────────────────────────────────────────────
    let fullInput = commentary;
    if (paragraphNotes.length > 0) {
      const notesText = paragraphNotes.map(n => `• Paragraph ${n.paragraph}: ${n.note}`).join('\n');
      fullInput = `${commentary}\n\nParagraph annotations:\n${notesText}`;
    }

    let aiCommentary = '';
    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 280,
          messages: [{
            role: 'user',
            content: `You are the GROUND validation engine for IN·KluSo. A professional has reviewed an article. Synthesize their input into 2-3 sentences of sharp, data-forward professional validation commentary.

RULES:
- 2-3 sentences max, institutional tone
- Reference what the professional confirms, adds, or reframes
- Plain text only — no markdown, no HTML
- Start directly, no preamble

ARTICLE: ${articleTitle || articleId}
${articleBody ? `EXCERPT: ${articleBody.substring(0, 500)}` : ''}
PROFESSIONAL: ${validatorName}, ${validatorTitle}${validatorOrg ? `, ${validatorOrg}` : ''}
INPUT: ${fullInput}

Write the validation commentary now.`
          }]
        })
      });
      const aiData = await aiRes.json();
      aiCommentary = aiData?.content?.[0]?.text || '';
    } catch (_) {}

    // ── Build validation object ─────────────────────────────────────────────
    // Field names match what review-mode.js reads (name/title/organization/ai_commentary)
    const validation = {
      id:           `val_${Date.now()}`,
      articleId,
      // Fields review-mode.js reads:
      name:         validatorName,
      title:        validatorTitle,
      organization: validatorOrg,
      ai_commentary: aiCommentary,
      // Also store under legacy names for backward compat:
      validatorName,
      validatorTitle,
      validatorOrg,
      validatorYears,
      aiCommentary,
      commentary,
      paragraphNotes,
      timestamp: new Date().toISOString(),
      level
    };

    // ── Save to KV ──────────────────────────────────────────────────────────
    let allValidations = [];
    if (env.VALIDATIONS) {
      const existing = await env.VALIDATIONS.get(`validations:${articleId}`);
      allValidations = existing ? JSON.parse(existing) : [];
      allValidations.push(validation);
      await env.VALIDATIONS.put(`validations:${articleId}`, JSON.stringify(allValidations));

      // Update contributor activity log
      existingActivity.unshift({
        slug:       articleId,
        title:      articleTitle || articleId,
        commentary,
        timestamp:  new Date().toISOString(),
        level
      });
      if (existingActivity.length > 50) existingActivity = existingActivity.slice(0, 50);
      await env.VALIDATIONS.put(activityKey, JSON.stringify(existingActivity));
    }

    // ── INTELLIGENCE STACKING: Level 2 Synthesis ────────────────────────────
    // When 2+ professionals validate the same article, generate a synthesis document.
    // Fire async via ctx.waitUntil so it doesn't delay the response.
    if (allValidations.length >= 2 && env.ANTHROPIC_API_KEY && ctx) {
      ctx.waitUntil(generateSynthesis(env, articleId, articleTitle, allValidations));
    }

    return new Response(JSON.stringify({
      success:           true,
      validation,
      stackCount:        allValidations.length,
      synthesisTriggered: allValidations.length >= 2
    }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

// ── Level 2 Synthesis Generator ────────────────────────────────────────────
async function generateSynthesis(env, articleId, articleTitle, validations) {
  try {
    const profiles = validations.map((v, i) => {
      const name = v.name || v.validatorName || 'Professional';
      const title = v.title || v.validatorTitle || '';
      const org = v.organization || v.validatorOrg || '';
      return `VALIDATOR ${i + 1}: ${name}${title ? ', ' + title : ''}${org ? ', ' + org : ''}\n"${v.commentary}"`;
    }).join('\n\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `You are the GROUND Intelligence Engine for IN·KluSo. ${validations.length} professionals have validated the same article. Generate a GROUND SIGNAL LEVEL 2 — a stacked intelligence synthesis.

ARTICLE: ${articleTitle || articleId}

${profiles}

Write a 3-4 paragraph Level 2 synthesis that:
1. Opens with the CONVERGENT SIGNAL — what do these professionals collectively confirm or reinforce?
2. Surfaces the most specific local insights, data points, and concrete claims they provided
3. Notes any productive tensions or divergent perspectives
4. Closes with a stacked verdict — what does the combined professional intelligence tell us that the article alone could not?

Rules: Plain text paragraphs only. No markdown headers, no bullet points. Institutional, data-forward tone. Start directly with the synthesis — no preamble.`
        }]
      })
    });

    const data = await res.json();
    const synthesis = data?.content?.[0]?.text || '';
    if (synthesis && env.VALIDATIONS) {
      await env.VALIDATIONS.put(`synthesis:${articleId}`, JSON.stringify({
        articleId,
        articleTitle,
        synthesis,
        validatorCount: validations.length,
        generatedAt:    new Date().toISOString(),
        validators:     validations.map(v => ({
          name:  v.name || v.validatorName,
          title: v.title || v.validatorTitle,
          org:   v.organization || v.validatorOrg
        }))
      }));
    }
  } catch (_) {
    // Synthesis generation failure is non-fatal
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
