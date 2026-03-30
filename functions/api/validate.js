// GROUND Signal — validate.js v5
// POST /api/validate
// Accepts structured five-dimension assessment + typed paragraph annotations
// Runs quality gate via Claude, computes SCI, determines assessment state, triggers Level 2 synthesis

export async function onRequestPost({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // ── Auth (session-based) ───────────────────────────────────────────────
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (!sessionMatch) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });
    }
    const sessionToken = sessionMatch[1];
    const sessionData = await env.VALIDATIONS.get(`session:${sessionToken}`, { type: 'json' });
    if (!sessionData || new Date(sessionData.expires) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired. Please log in again.' }), { status: 401, headers });
    }

    // Load full user profile
    const userRecord = await env.VALIDATIONS.get(`contrib:${sessionData.email}`, { type: 'json' });
    if (!userRecord) {
      return new Response(JSON.stringify({ error: 'User account not found.' }), { status: 401, headers });
    }

    const userId = userRecord.email;
    const userName = userRecord.name || sessionData.email;
    const userTitle = userRecord.title || '';
    const userOrg = userRecord.organization || userRecord.org || '';

    // ── Parse body ────────────────────────────────────────────────────────
    const body = await request.json();

    // Accept multiple field name formats for compatibility
    // Normalize slug: always use -- separator (review-mode.js uses --, dashboard may use /)
    const rawSlug = body.articleSlug || body.articleId || body.article || '';
    const articleSlug = rawSlug.replace(/\//g, '--');
    const commentary = body.commentary || body.criterio || body.comment || '';
    const paragraphNotes = body.paragraphNotes || body.notes || [];
    const scores = body.scores || {};

    if (!articleSlug || !commentary) {
      return new Response(JSON.stringify({ error: 'Missing required fields: articleSlug and commentary' }), { status: 400, headers });
    }

    // ── Compute SCI ───────────────────────────────────────────────────────
    function computeSCI(s) {
      if (!s || Object.values(s).every(v => !v || v === 0)) return null;
      const f = parseFloat(s.factual) || 0;
      const so = parseFloat(s.source) || 0;
      const r = parseFloat(s.rigor) || 0;
      const rel = parseFloat(s.relevance) || 0;
      const u = parseFloat(s.utility) || 0;
      const scored = [f, so, r, rel, u].filter(v => v > 0);
      if (scored.length === 0) return null;
      const raw = (f * 0.30) + (so * 0.25) + (r * 0.20) + (rel * 0.15) + (u * 0.10);
      return parseFloat((raw / 5).toFixed(3));
    }

    const sciScore = computeSCI(scores);

    // ── Quality Gate (Claude) ─────────────────────────────────────────────
    let aiCommentary = '';
    let qualityPassed = true;
    let qualityFeedback = '';

    if (env.ANTHROPIC_API_KEY) {
      const notesText = paragraphNotes.length > 0
        ? paragraphNotes.map((n, i) => `[¶${n.paragraph} | ${n.type || 'extend'}]: ${n.note}`).join('\n')
        : '(no paragraph annotations)';

      const scoresText = scores && Object.keys(scores).length > 0
        ? Object.entries(scores).map(([k, v]) => `${k}: ${v}/5`).join(', ')
        : '(no dimension scores provided)';

      const qualityPrompt = `You are reviewing a peer assessment submission for GROUND by IN-KluSo, an open peer review platform for industry intelligence articles.

ARTICLE SLUG: ${articleSlug}
DIMENSION SCORES: ${scoresText}
OVERALL COMMENTARY: ${commentary}
PARAGRAPH ANNOTATIONS:
${notesText}

QUALITY GATE RULES:
1. The submission MUST include at least one specific local insight — a concrete data point, named market example, specific metric, named company/geography, or direct professional experience reference. Generic observations like "this is a good analysis" or "I agree with this" do NOT pass.
2. If dimension scores are all 5/5 but commentary is minimal (<50 words), request more substantive reasoning.
3. Score-commentary consistency: if a dimension scores 1–2, there must be an explanation in commentary or annotations.
4. The professional takes ownership of their claims — correctness is NOT required, specificity IS required.

RESPONSE FORMAT (JSON only, no other text):
{
  "passes": true/false,
  "feedback": "if passes=false: 1-2 sentence constructive message explaining what specific insight is missing and how to strengthen the submission",
  "aiCommentary": "if passes=true: 2-3 sentence professional synthesis commentary from GROUND's perspective on this assessment. Acknowledge the specific insight provided."
}`;

      try {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 512,
            messages: [{ role: 'user', content: qualityPrompt }]
          })
        });

        if (anthropicRes.ok) {
          const anthropicData = await anthropicRes.json();
          const rawText = anthropicData.content?.[0]?.text || '{}';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            qualityPassed = parsed.passes !== false;
            qualityFeedback = parsed.feedback || '';
            aiCommentary = parsed.aiCommentary || '';
          }
        }
      } catch(e) {
        // If Claude fails, allow submission through
        qualityPassed = true;
        aiCommentary = '';
      }
    }

    if (!qualityPassed) {
      return new Response(JSON.stringify({
        error: 'quality_gate',
        feedback: qualityFeedback || 'Your submission needs at least one specific local insight — a concrete data point, named market example, or direct professional experience reference.'
      }), { status: 400, headers });
    }

    // ── Load existing validations ─────────────────────────────────────────
    const kvKey = `validations:${articleSlug}`;
    let kvData = { validations: [], assessmentState: 'UNREVIEWED', computedSCI: null, dimensionAverages: {}, synthesis: null };

    const existing = await env.VALIDATIONS.get(kvKey);
    if (existing) {
      try { kvData = JSON.parse(existing); } catch(e) {}
    }
    if (!Array.isArray(kvData.validations)) kvData.validations = [];

    // ── Build validation record ───────────────────────────────────────────
    const validation = {
      contributorId: userId,
      name: userName,
      title: userTitle,
      organization: userOrg,
      timestamp: new Date().toISOString(),
      scores,
      commentary,
      paragraphNotes,
      ai_commentary: aiCommentary
    };

    kvData.validations.push(validation);
    const count = kvData.validations.length;

    // ── Compute aggregate SCI ─────────────────────────────────────────────
    const allScored = kvData.validations.filter(v => v.scores && Object.values(v.scores).some(s => s > 0));
    if (allScored.length > 0) {
      const dims = ['factual', 'source', 'rigor', 'relevance', 'utility'];
      const dimAvgs = {};
      dims.forEach(d => {
        const vals = allScored.map(v => parseFloat(v.scores[d]) || 0).filter(v => v > 0);
        dimAvgs[d] = vals.length > 0 ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
      });
      kvData.dimensionAverages = dimAvgs;
      kvData.computedSCI = computeSCI(dimAvgs);
    }

    // ── Assessment state ──────────────────────────────────────────────────
    function determineState(validations, dimAvgs) {
      const n = validations.length;
      if (n === 0) return 'UNREVIEWED';
      if (n === 1) return 'VALIDATED';

      // Check for Gold Standard: 3+ reviewers, all dimension averages >= 4.0
      if (n >= 3 && dimAvgs && Object.values(dimAvgs).every(v => v >= 4.0)) {
        // Check no contested dimensions
        const dims = ['factual', 'source', 'rigor', 'relevance', 'utility'];
        const contested = dims.some(d => {
          const vals = validations.map(v => parseFloat(v.scores?.[d]) || 0).filter(v => v > 0);
          if (vals.length < 2) return false;
          const range = Math.max(...vals) - Math.min(...vals);
          return range >= 2;
        });
        if (!contested) return 'GOLD_STANDARD';
      }

      // Check contested: any dimension where reviewers diverge by 2+ points
      if (n >= 2) {
        const dims = ['factual', 'source', 'rigor', 'relevance', 'utility'];
        const isContested = dims.some(d => {
          const vals = validations.map(v => parseFloat(v.scores?.[d]) || 0).filter(v => v > 0);
          if (vals.length < 2) return false;
          return Math.max(...vals) - Math.min(...vals) >= 2;
        });
        if (isContested) return 'CONTESTED';
        return 'PEER_REVIEWED';
      }

      return 'PEER_REVIEWED';
    }

    kvData.assessmentState = determineState(kvData.validations, kvData.dimensionAverages);

    // ── Level 2 Synthesis (on 2nd validation) ────────────────────────────
    if (count === 2 && env.ANTHROPIC_API_KEY) {
      try {
        const v1 = kvData.validations[0];
        const v2 = kvData.validations[1];
        const dimAvgs = kvData.dimensionAverages;

        const synthPrompt = `You are generating a GROUND SIGNAL LEVEL 2 synthesis document for the article: "${articleSlug.replace(/--/g, ' / ').replace(/-/g, ' ')}".

Two credentialed industry professionals have now assessed this article.

VALIDATOR 1: ${v1.name} (${[v1.title, v1.organization].filter(Boolean).join(', ')})
Scores: ${JSON.stringify(v1.scores || {})}
Commentary: ${v1.commentary}
Paragraph annotations: ${(v1.paragraphNotes || []).map(n => `[¶${n.paragraph}|${n.type}]: ${n.note}`).join(' | ')}

VALIDATOR 2: ${v2.name} (${[v2.title, v2.organization].filter(Boolean).join(', ')})
Scores: ${JSON.stringify(v2.scores || {})}
Commentary: ${v2.commentary}
Paragraph annotations: ${(v2.paragraphNotes || []).map(n => `[¶${n.paragraph}|${n.type}]: ${n.note}`).join(' | ')}

AGGREGATE DIMENSION AVERAGES: ${JSON.stringify(dimAvgs)}
ASSESSMENT STATE: ${kvData.assessmentState}

Write a 3-4 sentence Level 2 synthesis in first-person plural ("The peer record shows…", "Across both assessments…"). Focus on:
1. Points of convergence between the two validators
2. Any divergences or contested claims
3. What the stacked intelligence reveals that neither assessment alone could

Be specific, authoritative, and grounded in what the validators actually said. No fluff.`;

        const synthRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 400,
            messages: [{ role: 'user', content: synthPrompt }]
          })
        });

        if (synthRes.ok) {
          const synthData = await synthRes.json();
          kvData.synthesis = synthData.content?.[0]?.text || '';
        }
      } catch(e) {}
    }

    // Extend synthesis for 3+ validators
    if (count > 2 && env.ANTHROPIC_API_KEY && count % 1 === 0) {
      try {
        const multiPrompt = `GROUND SIGNAL — Multi-Perspective Analysis for: "${articleSlug.replace(/--/g, ' / ').replace(/-/g, ' ')}"

${count} credentialed professionals have now assessed this article.
Assessment state: ${kvData.assessmentState}
Dimension averages: ${JSON.stringify(kvData.dimensionAverages)}

Latest validator: ${userName} (${[userTitle, userOrg].filter(Boolean).join(', ')})
Added: ${commentary}

Update the synthesis in 2-3 sentences to reflect what ${count} professional assessments now reveal collectively. Reference convergence patterns, contested dimensions if any, or emerging consensus.`;

        const multiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 300,
            messages: [{ role: 'user', content: multiPrompt }]
          })
        });

        if (multiRes.ok) {
          const multiData = await multiRes.json();
          const newSynthesis = multiData.content?.[0]?.text || '';
          if (newSynthesis) kvData.synthesis = newSynthesis;
        }
      } catch(e) {}
    }

    // ── Save to KV ────────────────────────────────────────────────────────
    await env.VALIDATIONS.put(kvKey, JSON.stringify(kvData));

    // ── Update user record ────────────────────────────────────────────────
    if (userId) {
      try {
        const userKey = `contrib:${userId}`;
        const userData = await env.VALIDATIONS.get(userKey);
        if (userData) {
          const user = JSON.parse(userData);
          if (!Array.isArray(user.validations)) user.validations = [];
          user.validations.push({
            articleSlug,
            timestamp: validation.timestamp,
            commentary: commentary.substring(0, 200)
          });
          user.validationCount = (user.validationCount || 0) + 1;

          // Update level
          const count_v = user.validationCount;
          if (count_v >= 30) { user.level = 5; user.levelName = 'GROUND Expert'; }
          else if (count_v >= 15) { user.level = 4; user.levelName = 'Principal'; }
          else if (count_v >= 5) { user.level = 3; user.levelName = 'Senior Analyst'; }
          else if (count_v >= 1) { user.level = 2; user.levelName = 'Field Analyst'; }
          else { user.level = 1; user.levelName = 'Signal Watcher'; }

          await env.VALIDATIONS.put(userKey, JSON.stringify(user));
        }
      } catch(e) {}
    }

    return new Response(JSON.stringify({
      success: true,
      validation,
      assessmentState: kvData.assessmentState,
      computedSCI: kvData.computedSCI,
      synthesis: kvData.synthesis || null
    }), { status: 200, headers });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
