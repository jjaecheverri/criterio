/* GROUND SIGNAL — Review Mode v5
 * Open Peer Review System
 * Structured five-dimension assessment + typed paragraph annotations
 */
(function() {
  // Hide legacy V4 inline validation form (superseded by V5 Review Mode panel)
  var hideOldForm = document.createElement('style');
  hideOldForm.textContent = '#validations-section, .validation-stack { display: none !important; }';
  document.head.appendChild(hideOldForm);
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────
  const ANNOTATION_TYPES = {
    corroborate: { label: 'Corroborate', color: '#2E9B6F', desc: 'I can confirm this from professional experience' },
    challenge:   { label: 'Challenge',   color: '#E8602C', desc: 'This claim needs qualification or correction' },
    extend:      { label: 'Extend',      color: '#2D6BE4', desc: 'Here\'s additional context' },
    clarify:     { label: 'Clarify',     color: '#C9A84C', desc: 'This could be misread — here\'s what it means in practice' }
  };

  const DIMENSIONS = [
    { key: 'factual',   label: 'Factual Accuracy',    desc: 'Claims, statistics, and data points are verifiable and correct', weight: 0.30 },
    { key: 'source',    label: 'Source Quality',       desc: 'Underlying sources are credible and current', weight: 0.25 },
    { key: 'rigor',     label: 'Analytical Rigor',     desc: 'Conclusions are supported by evidence; limitations acknowledged', weight: 0.20 },
    { key: 'relevance', label: 'Industry Relevance',   desc: 'Addresses a real question practitioners face', weight: 0.15 },
    { key: 'utility',   label: 'Practitioner Utility', desc: 'A working professional would find this actionable', weight: 0.10 }
  ];

  const ASSESSMENT_STATES = {
    UNREVIEWED:    { label: 'Awaiting Validation',         color: '#8A8578' },
    VALIDATED:     { label: 'Validated',                   color: '#2D6BE4' },
    PEER_REVIEWED: { label: 'Peer Reviewed',               color: '#2E9B6F' },
    CONTESTED:     { label: 'Under Review',                color: '#E8602C' },
    GOLD_STANDARD: { label: 'Gold Standard',               color: '#C9A84C' }
  };

  // ─── State ───────────────────────────────────────────────────────────────
  let panelOpen = false;
  let activeTab = 'livefeed';
  let paragraphNotes = [];
  let scores = { factual: 0, source: 0, rigor: 0, relevance: 0, utility: 0 };
  let pollInterval = null;
  let articleSlug = '';
  let currentUser = null;
  let isLoggedIn = false;

  // ─── Slug detection ──────────────────────────────────────────────────────
  function getSlug() {
    const path = window.location.pathname.replace(/\/$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) return parts.join('--');
    return parts[0] || 'unknown';
  }

  // ─── Auth check ──────────────────────────────────────────────────────────
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        currentUser = await res.json();
        isLoggedIn = true;
      }
    } catch(e) {}
  }

  // ─── SCI Computation ─────────────────────────────────────────────────────
  function computeSCI(s) {
    if (!s || Object.values(s).every(v => v === 0)) return null;
    const raw = (s.factual * 0.30) + (s.source * 0.25) + (s.rigor * 0.20) + (s.relevance * 0.15) + (s.utility * 0.10);
    return (raw / 5).toFixed(2);
  }

  function sciLabel(sci, count) {
    if (!sci || count === 0) return 'Estimated';
    if (count === 1) return 'Validated';
    return 'Peer Reviewed';
  }

  // ─── Styles ──────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #rm-trigger{position:fixed;bottom:28px;right:28px;z-index:9000;background:#111;color:#FAF6EE;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;padding:12px 20px;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,0.3);transition:transform 0.15s,box-shadow 0.15s;}
      #rm-trigger:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.4);}
      #rm-trigger .rm-dot{width:8px;height:8px;background:#2E9B6F;border-radius:50%;animation:rm-pulse 2s infinite;}
      @keyframes rm-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(1.3);}}
      #rm-panel{position:fixed;top:0;right:0;height:100vh;width:420px;max-width:95vw;background:#0a0a0a;color:#FAF6EE;font-family:'Inter',sans-serif;z-index:10000;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);display:flex;flex-direction:column;box-shadow:-8px 0 48px rgba(0,0,0,0.5);}
      #rm-panel.open{transform:translateX(0);}
      #rm-header{padding:20px 20px 0;border-bottom:1px solid #1a1a1a;flex-shrink:0;}
      #rm-header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
      .rm-brand{font-size:11px;letter-spacing:2px;font-weight:700;color:#2E9B6F;text-transform:uppercase;}
      #rm-close{background:none;border:none;color:#666;cursor:pointer;font-size:20px;padding:4px 8px;line-height:1;}
      #rm-close:hover{color:#FAF6EE;}
      #rm-tabs{display:flex;gap:0;border-bottom:1px solid #1a1a1a;}
      .rm-tab{flex:1;padding:10px 8px;background:none;border:none;color:#666;font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s;}
      .rm-tab.active{color:#FAF6EE;border-bottom-color:#2E9B6F;}
      .rm-tab:hover:not(.active){color:#aaa;}
      #rm-body{flex:1;overflow-y:auto;padding:20px;}
      #rm-body::-webkit-scrollbar{width:4px;}
      #rm-body::-webkit-scrollbar-track{background:#111;}
      #rm-body::-webkit-scrollbar-thumb{background:#333;}
      .lf-empty{text-align:center;padding:40px 20px;color:#444;font-size:14px;}
      .lf-entry{background:#111;border:1px solid #1a1a1a;padding:16px;margin-bottom:12px;}
      .lf-entry-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;}
      .lf-name{font-weight:700;font-size:13px;color:#FAF6EE;}
      .lf-creds{font-size:11px;color:#666;margin-top:2px;}
      .lf-time{font-size:10px;color:#444;white-space:nowrap;margin-left:8px;}
      .lf-commentary{font-size:13px;color:#aaa;line-height:1.6;margin-bottom:10px;}
      .lf-scores{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}
      .lf-score-chip{font-size:10px;font-family:'JetBrains Mono',monospace;padding:3px 7px;background:#1a1a1a;color:#666;border:1px solid #222;}
      .lf-score-chip.high{color:#2E9B6F;border-color:#2E9B6F22;}
      .lf-score-chip.mid{color:#C9A84C;border-color:#C9A84c22;}
      .lf-annotations{margin-top:8px;}
      .lf-annotation{font-size:12px;padding:8px 10px;border-left:3px solid;margin-bottom:4px;}
      .lf-annotation-type{font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3px;}
      .lf-annotation-note{color:#888;line-height:1.5;}
      .lf-ai{background:#0d1a12;border:1px solid #1a3320;padding:12px;margin-top:8px;font-size:12px;color:#6dbf94;line-height:1.6;}
      .lf-ai-label{font-size:10px;letter-spacing:1.5px;color:#2E9B6F;font-weight:700;margin-bottom:6px;text-transform:uppercase;}
      .lf-synthesis{background:#1a1400;border:2px solid #C9A84C44;padding:16px;margin-bottom:16px;}
      .lf-synthesis-label{font-size:10px;letter-spacing:2px;color:#C9A84C;font-weight:700;text-transform:uppercase;margin-bottom:8px;}
      .lf-synthesis-text{font-size:13px;color:#C9A84C;line-height:1.7;opacity:0.9;}
      .lf-state-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;}
      .lf-sci{font-size:11px;font-family:'JetBrains Mono',monospace;color:#444;margin-bottom:8px;}
      .notes-empty{text-align:center;padding:40px 20px;color:#444;font-size:14px;}
      .note-item{background:#111;border:1px solid #1a1a1a;padding:14px;margin-bottom:8px;}
      .note-item-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
      .note-para{font-size:10px;font-family:'JetBrains Mono',monospace;color:#444;}
      .note-type-badge{font-size:10px;font-weight:700;letter-spacing:0.06em;padding:2px 8px;text-transform:uppercase;}
      .note-text{font-size:13px;color:#aaa;line-height:1.5;}
      .note-del{background:none;border:none;color:#333;cursor:pointer;font-size:14px;padding:2px 4px;}
      .note-del:hover{color:#E8602C;}
      .rm-form-section{margin-bottom:20px;}
      .rm-form-label{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;color:#666;margin-bottom:8px;display:block;}
      .rm-textarea{width:100%;background:#111;border:1px solid #222;color:#FAF6EE;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;padding:12px;resize:vertical;min-height:80px;outline:none;}
      .rm-textarea:focus{border-color:#2E9B6F;}
      .rm-textarea::placeholder{color:#333;}
      .rm-dimension{margin-bottom:14px;}
      .rm-dim-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
      .rm-dim-label{font-size:12px;font-weight:600;color:#FAF6EE;}
      .rm-dim-desc{font-size:11px;color:#444;margin-bottom:6px;}
      .rm-dim-score{font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;min-width:20px;text-align:right;}
      .rm-dim-score.s0{color:#333;}
      .rm-dim-score.s1,.rm-dim-score.s2{color:#E8602C;}
      .rm-dim-score.s3{color:#C9A84C;}
      .rm-dim-score.s4,.rm-dim-score.s5{color:#2E9B6F;}
      .rm-slider{width:100%;-webkit-appearance:none;appearance:none;height:3px;background:#222;outline:none;}
      .rm-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:#2E9B6F;cursor:pointer;border-radius:0;}
      .rm-slider-labels{display:flex;justify-content:space-between;font-size:10px;color:#333;font-family:'JetBrains Mono',monospace;margin-top:3px;}
      .rm-sci-preview{background:#0d1a12;border:1px solid #1a3320;padding:12px;margin-top:16px;text-align:center;}
      .rm-sci-value{font-size:28px;font-family:'JetBrains Mono',monospace;font-weight:700;color:#2E9B6F;}
      .rm-sci-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#2E9B6F;opacity:0.6;margin-top:2px;}
      .rm-submit-btn{width:100%;background:#2E9B6F;color:#fff;border:none;font-family:'Inter',sans-serif;font-size:14px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;padding:16px;cursor:pointer;margin-top:20px;transition:background 0.15s;}
      .rm-submit-btn:hover{background:#269160;}
      .rm-submit-btn:disabled{background:#1a3320;color:#2E9B6F;cursor:not-allowed;}
      .rm-login-prompt{text-align:center;padding:40px 20px;color:#666;}
      .rm-login-prompt a{color:#2E9B6F;font-weight:700;text-decoration:none;}
      .rm-share-panel{padding:20px;}
      .rm-share-title{font-family:'DM Serif Display',serif;font-size:22px;margin-bottom:8px;line-height:1.3;}
      .rm-share-sub{font-size:13px;color:#666;margin-bottom:24px;line-height:1.5;}
      .rm-share-btn{width:100%;padding:14px;border:1px solid #222;background:none;color:#FAF6EE;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;text-align:left;display:flex;align-items:center;gap:10px;transition:border-color 0.15s;}
      .rm-share-btn:hover{border-color:#2E9B6F;}
      .rm-share-btn svg{flex-shrink:0;}
      .rm-feedback{padding:16px;background:#1a0a00;border:1px solid #E8602C33;margin-top:12px;font-size:13px;color:#E8602C;line-height:1.6;}
      .rm-feedback-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:8px;color:#E8602C;}
      /* Paragraph annotation UI */
      .rm-para-wrapper{position:relative;}
      .rm-para-btn{position:absolute;left:-28px;top:50%;transform:translateY(-50%);width:20px;height:20px;background:#111;border:1px solid #222;color:#444;font-size:14px;cursor:pointer;display:none;align-items:center;justify-content:center;line-height:1;z-index:100;transition:all 0.15s;}
      .rm-para-btn:hover{background:#2E9B6F;border-color:#2E9B6F;color:#fff;}
      .rm-para-wrapper:hover .rm-para-btn{display:flex;}
      .rm-inline-note{background:#0d1a12;border:1px solid #1a3320;padding:12px;margin-top:8px;display:none;}
      .rm-inline-note.open{display:block;}
      .rm-inline-type-row{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;}
      .rm-type-btn{padding:4px 10px;border:1px solid #222;background:none;font-family:'Inter',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.06em;cursor:pointer;text-transform:uppercase;transition:all 0.15s;}
      .rm-type-btn.selected{color:#fff;}
      .rm-inline-input{width:100%;background:#111;border:1px solid #222;color:#FAF6EE;font-family:'Inter',sans-serif;font-size:12px;padding:8px;outline:none;resize:none;min-height:60px;}
      .rm-inline-input:focus{border-color:#2E9B6F;}
      .rm-inline-actions{display:flex;gap:8px;margin-top:8px;}
      .rm-add-note-btn{padding:6px 14px;background:#2E9B6F;color:#fff;border:none;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;cursor:pointer;}
      .rm-cancel-note-btn{padding:6px 14px;background:none;border:1px solid #222;color:#666;font-family:'Inter',sans-serif;font-size:11px;cursor:pointer;}
    `;
    document.head.appendChild(style);
  }

  // ─── Build Panel HTML ─────────────────────────────────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'rm-panel';
    panel.innerHTML = `
      <div id="rm-header">
        <div id="rm-header-top">
          <div>
            <div class="rm-brand">GROUND SIGNAL</div>
            <div style="font-size:11px;color:#444;margin-top:2px;letter-spacing:0.04em;">Open Peer Review System</div>
          </div>
          <button id="rm-close" title="Close">✕</button>
        </div>
        <div id="rm-tabs">
          <button class="rm-tab active" data-tab="livefeed">Live Feed</button>
          <button class="rm-tab" data-tab="assess">Assess</button>
          <button class="rm-tab" data-tab="notes">My Notes <span id="rm-note-count"></span></button>
        </div>
      </div>
      <div id="rm-body">
        <div id="rm-tab-livefeed"></div>
        <div id="rm-tab-assess" style="display:none;"></div>
        <div id="rm-tab-notes" style="display:none;"></div>
        <div id="rm-tab-share" style="display:none;"></div>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('rm-close').addEventListener('click', closePanel);
    panel.querySelectorAll('.rm-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  // ─── Trigger Button ───────────────────────────────────────────────────────
  function buildTrigger() {
    const btn = document.createElement('button');
    btn.id = 'rm-trigger';
    btn.innerHTML = '<span class="rm-dot"></span>Review & Validate';
    btn.addEventListener('click', openPanel);
    document.body.appendChild(btn);
  }

  // ─── Panel open/close ─────────────────────────────────────────────────────
  function openPanel() {
    // Gate on auth — redirect to login immediately if not signed in
    if (!isLoggedIn) {
      window.location.href = '/login/?return=' + encodeURIComponent(window.location.pathname);
      return;
    }
    panelOpen = true;
    document.getElementById('rm-panel').classList.add('open');
    switchTab('livefeed');
    startPoll();
  }

  function closePanel() {
    panelOpen = false;
    document.getElementById('rm-panel').classList.remove('open');
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  // ─── Tab switching ────────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.rm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    ['livefeed','assess','notes','share'].forEach(t => {
      const el = document.getElementById(`rm-tab-${t}`);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    if (tab === 'assess') renderAssessTab();
    if (tab === 'notes') renderNotesTab();
  }

  // ─── Live Feed ───────────────────────────────────────────────────────────
  let lastValidationCount = -1;

  async function fetchLiveFeed() {
    try {
      const res = await fetch(`/api/validations?slug=${articleSlug}`);
      const data = await res.json();
      renderLiveFeed(data);
    } catch(e) {}
  }

  function startPoll() {
    fetchLiveFeed();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => { if (panelOpen && activeTab === 'livefeed') fetchLiveFeed(); }, 30000);
  }

  function renderLiveFeed(data) {
    const el = document.getElementById('rm-tab-livefeed');
    if (!el) return;

    const validations = data.validations || [];
    const state = data.assessmentState || 'UNREVIEWED';
    const sci = data.computedSCI;
    const synthesis = data.synthesis;
    const stateInfo = ASSESSMENT_STATES[state] || ASSESSMENT_STATES.UNREVIEWED;

    // Update validator badge in article
    updateArticleBadge(validations, state, stateInfo, sci);

    // Update peer activity count
    const activityEl = document.getElementById('vb-activity');
    const countEl = document.getElementById('vb-count');
    if (activityEl && validations.length > 0) {
      activityEl.style.display = 'flex';
      if (countEl) countEl.textContent = validations.length;
    }

    let html = '';

    // State badge + SCI
    html += `<div class="lf-state-badge" style="background:${stateInfo.color}22;color:${stateInfo.color};border:1px solid ${stateInfo.color}33;">
      <span style="width:6px;height:6px;background:${stateInfo.color};border-radius:50%;display:inline-block;"></span>
      ${stateInfo.label}
    </div>`;

    if (sci) {
      html += `<div class="lf-sci">SCI Score: <strong style="color:#2E9B6F;">${sci}</strong> <span style="color:#333;">· ${validations.length} validator${validations.length !== 1 ? 's' : ''}</span></div>`;
    }

    // Synthesis banner
    if (synthesis) {
      html += `<div class="lf-synthesis">
        <div class="lf-synthesis-label">⬡ GROUND SIGNAL LEVEL 2 — Stacked Intelligence</div>
        <div class="lf-synthesis-text">${synthesis}</div>
      </div>`;
    }

    if (validations.length === 0) {
      html += `<div class="lf-empty">
        <div style="font-size:28px;margin-bottom:12px;opacity:0.3;">◎</div>
        <div>No peer reviews yet.</div>
        <div style="margin-top:6px;font-size:12px;">Be the first professional to assess this article.</div>
        ${isLoggedIn ? '<div style="margin-top:16px;"><button onclick="document.querySelector(\'.rm-tab[data-tab=assess]\').click()" style="padding:8px 16px;background:#2E9B6F;color:#fff;border:none;font-family:Inter,sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Start Assessment →</button></div>' : ''}
      </div>`;
    } else {
      validations.forEach(v => {
        const dimScores = v.scores || {};
        const sci_v = computeSCI(dimScores);
        html += `<div class="lf-entry">
          <div class="lf-entry-header">
            <div>
              <div class="lf-name">${v.name || 'Professional'}</div>
              <div class="lf-creds">${[v.title, v.organization].filter(Boolean).join(' · ')}</div>
            </div>
            <div class="lf-time">${formatTime(v.timestamp)}</div>
          </div>`;

        // Dimension score chips
        if (Object.values(dimScores).some(s => s > 0)) {
          html += '<div class="lf-scores">';
          DIMENSIONS.forEach(d => {
            const s = dimScores[d.key] || 0;
            if (s > 0) {
              const cls = s >= 4 ? 'high' : s >= 3 ? 'mid' : '';
              html += `<span class="lf-score-chip ${cls}">${d.label.split(' ')[0]}: ${s}/5</span>`;
            }
          });
          if (sci_v) html += `<span class="lf-score-chip high">SCI: ${sci_v}</span>`;
          html += '</div>';
        }

        if (v.commentary) {
          html += `<div class="lf-commentary">${v.commentary}</div>`;
        }

        // Paragraph annotations
        if (v.paragraphNotes && v.paragraphNotes.length > 0) {
          html += '<div class="lf-annotations">';
          v.paragraphNotes.forEach(note => {
            const type = ANNOTATION_TYPES[note.type] || ANNOTATION_TYPES.extend;
            html += `<div class="lf-annotation" style="border-left-color:${type.color};background:${type.color}0a;">
              <div class="lf-annotation-type" style="color:${type.color};">${type.label} · ¶${note.paragraph}</div>
              <div class="lf-annotation-note">${note.note}</div>
            </div>`;
          });
          html += '</div>';
        }

        if (v.ai_commentary) {
          html += `<div class="lf-ai"><div class="lf-ai-label">AI Commentary</div>${v.ai_commentary}</div>`;
        }

        html += '</div>';
      });
    }

    el.innerHTML = html;
  }

  function updateArticleBadge(validations, state, stateInfo, sci) {
    const labelEl = document.getElementById('vb-label');
    const nameEl = document.getElementById('vb-name');
    const bodyEl = document.getElementById('vb-body');
    const iconEl = document.getElementById('vb-icon');

    if (!labelEl) return;

    if (validations.length === 0) return;

    const latest = validations[validations.length - 1];
    if (labelEl) labelEl.textContent = stateInfo.label.toUpperCase();
    if (labelEl) labelEl.style.color = stateInfo.color;
    if (iconEl) iconEl.style.background = stateInfo.color;

    if (state === 'GOLD_STANDARD') {
      if (nameEl) nameEl.textContent = `${validations.length} Validators · Gold Standard`;
      if (bodyEl) bodyEl.textContent = `This article has achieved Gold Standard status — reviewed by ${validations.length} credentialed professionals with strong agreement across all dimensions.`;
    } else if (state === 'PEER_REVIEWED' || state === 'CONTESTED') {
      if (nameEl) nameEl.textContent = `${validations.length} Professionals`;
      if (bodyEl) bodyEl.textContent = state === 'CONTESTED' ? 'Peer reviewers have divergent assessments on one or more dimensions. Active discussion in progress.' : `Peer reviewed by ${validations.length} credentialed industry professionals.`;
    } else if (validations.length >= 1) {
      const v = validations[0];
      if (nameEl) nameEl.textContent = `${v.name} · ${[v.title, v.organization].filter(Boolean).join(', ')}`;
      if (bodyEl) bodyEl.textContent = latest.commentary ? latest.commentary.substring(0, 160) + (latest.commentary.length > 160 ? '…' : '') : 'Validated by a credentialed professional.';
    }
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ─── Assess Tab ───────────────────────────────────────────────────────────
  async function renderAssessTab() {
    const el = document.getElementById('rm-tab-assess');
    if (!el) return;

    // Always verify auth from server (never trust cached isLoggedIn alone)
    el.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#8A9BA8;font-size:13px;">Checking credentials…</div>`;
    try {
      const authRes = await fetch('/api/auth/me', { credentials: 'include' });
      if (authRes.ok) {
        const userData = await authRes.json();
        currentUser = userData;
        isLoggedIn = true;
      } else {
        isLoggedIn = false;
        currentUser = null;
      }
    } catch(e) {
      isLoggedIn = false;
    }

    if (!isLoggedIn) {
      el.innerHTML = `<div class="rm-login-prompt">
        <div style="font-size:32px;margin-bottom:16px;opacity:0.3;">🔒</div>
        <div style="margin-bottom:8px;font-weight:600;color:#FAF6EE;">Credentialed access required</div>
        <div style="font-size:13px;margin-bottom:20px;">Sign in to submit a structured peer assessment.</div>
        <a href="/login/?return=${encodeURIComponent(window.location.pathname)}" style="display:inline-block;padding:10px 20px;background:#2E9B6F;color:#fff;text-decoration:none;font-weight:700;font-size:13px;">Sign In →</a>
      </div>`;
      return;
    }

    let dimHtml = '';
    DIMENSIONS.forEach(d => {
      const val = scores[d.key] || 0;
      const cls = val === 0 ? 's0' : val <= 2 ? `s${val}` : val === 3 ? 's3' : `s${val}`;
      dimHtml += `<div class="rm-dimension">
        <div class="rm-dim-header">
          <div class="rm-dim-label">${d.label}</div>
          <div class="rm-dim-score ${cls}" id="score-display-${d.key}">${val === 0 ? '—' : val + '/5'}</div>
        </div>
        <div class="rm-dim-desc">${d.desc}</div>
        <input type="range" class="rm-slider" min="0" max="5" step="1" value="${val}" data-dim="${d.key}" id="slider-${d.key}">
        <div class="rm-slider-labels"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
      </div>`;
    });

    const previewSCI = computeSCI(scores);

    el.innerHTML = `
      <div class="rm-form-section">
        <div class="rm-brand" style="margin-bottom:12px;">Structured Assessment</div>
        <div style="font-size:12px;color:#666;line-height:1.6;margin-bottom:20px;">Rate each dimension 1–5. Your scores contribute to the article's SCI (Signal Credibility Index). You must include at least one paragraph annotation.</div>
        ${dimHtml}
        <div class="rm-sci-preview">
          <div class="rm-sci-value" id="rm-sci-preview-val">${previewSCI ? previewSCI : '—'}</div>
          <div class="rm-sci-label">Your SCI Contribution</div>
        </div>
      </div>
      <div class="rm-form-section">
        <label class="rm-form-label">Overall Commentary *</label>
        <textarea class="rm-textarea" id="rm-commentary" placeholder="Share your professional perspective on this article. Include at least one specific local insight, data point, or named market example…" rows="5"></textarea>
      </div>
      <div id="rm-notes-preview" style="margin-bottom:8px;font-size:12px;color:#666;"></div>
      <div id="rm-feedback" style="display:none;" class="rm-feedback"></div>
      <button class="rm-submit-btn" id="rm-submit-btn">✓ Submit Peer Assessment</button>
    `;

    // Slider events
    el.querySelectorAll('.rm-slider').forEach(slider => {
      slider.addEventListener('input', e => {
        const dim = e.target.dataset.dim;
        const val = parseInt(e.target.value);
        scores[dim] = val;
        const display = document.getElementById(`score-display-${dim}`);
        if (display) {
          const cls = val === 0 ? 's0' : val <= 2 ? `s${val}` : val === 3 ? 's3' : `s${val}`;
          display.textContent = val === 0 ? '—' : val + '/5';
          display.className = `rm-dim-score ${cls}`;
        }
        const sci = computeSCI(scores);
        const sciEl = document.getElementById('rm-sci-preview-val');
        if (sciEl) sciEl.textContent = sci || '—';
      });
    });

    document.getElementById('rm-submit-btn').addEventListener('click', submitAssessment);

    updateNotePreview();
  }

  function updateNotePreview() {
    const el = document.getElementById('rm-notes-preview');
    if (!el) return;
    if (paragraphNotes.length > 0) {
      el.textContent = `${paragraphNotes.length} paragraph annotation${paragraphNotes.length !== 1 ? 's' : ''} attached`;
      el.style.color = '#2E9B6F';
    } else {
      el.textContent = '↑ Hover over paragraphs in the article to add annotations';
    }
  }

  // ─── Notes Tab ────────────────────────────────────────────────────────────
  function renderNotesTab() {
    const el = document.getElementById('rm-tab-notes');
    if (!el) return;

    const countEl = document.getElementById('rm-note-count');
    if (countEl) countEl.textContent = paragraphNotes.length > 0 ? `(${paragraphNotes.length})` : '';

    if (paragraphNotes.length === 0) {
      el.innerHTML = `<div class="notes-empty">
        <div style="font-size:28px;margin-bottom:12px;opacity:0.3;">¶</div>
        <div>No annotations yet.</div>
        <div style="margin-top:6px;font-size:12px;">Hover over paragraphs in the article to add typed annotations.</div>
      </div>`;
      return;
    }

    let html = `<div style="font-size:11px;color:#666;margin-bottom:12px;letter-spacing:0.06em;">${paragraphNotes.length} ANNOTATION${paragraphNotes.length !== 1 ? 'S' : ''} ATTACHED</div>`;
    paragraphNotes.forEach((note, i) => {
      const type = ANNOTATION_TYPES[note.type] || ANNOTATION_TYPES.extend;
      html += `<div class="note-item">
        <div class="note-item-header">
          <span class="note-para">¶${note.paragraph}</span>
          <span class="note-type-badge" style="background:${type.color}22;color:${type.color};">${type.label}</span>
          <button class="note-del" data-idx="${i}" title="Remove">✕</button>
        </div>
        <div class="note-text">${note.note}</div>
      </div>`;
    });

    el.innerHTML = html;
    el.querySelectorAll('.note-del').forEach(btn => {
      btn.addEventListener('click', e => {
        paragraphNotes.splice(parseInt(e.target.dataset.idx), 1);
        renderNotesTab();
        updateNotePreview();
      });
    });
  }

  // ─── Paragraph Annotations ───────────────────────────────────────────────
  function wrapParagraphs() {
    const article = document.querySelector('article, .article-body, .article-content, main');
    if (!article) return;

    const paras = article.querySelectorAll('p, h2, h3, blockquote');
    paras.forEach((p, idx) => {
      if (p.closest('.validator-badge, .disclosure, .cta-section, .validation-stack, footer, nav')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'rm-para-wrapper';
      wrapper.style.cssText = 'position:relative;';
      p.parentNode.insertBefore(wrapper, p);
      wrapper.appendChild(p);

      const btn = document.createElement('button');
      btn.className = 'rm-para-btn';
      btn.textContent = '+';
      btn.title = 'Annotate this paragraph';
      btn.addEventListener('click', () => openInlineNote(wrapper, idx + 1));
      wrapper.appendChild(btn);
    });
  }

  function openInlineNote(wrapper, paraNum) {
    // Close any open inline notes first
    document.querySelectorAll('.rm-inline-note.open').forEach(n => n.classList.remove('open'));

    let noteBox = wrapper.querySelector('.rm-inline-note');
    if (!noteBox) {
      noteBox = document.createElement('div');
      noteBox.className = 'rm-inline-note';
      noteBox.innerHTML = `
        <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#2E9B6F;font-weight:700;margin-bottom:8px;">Annotate ¶${paraNum}</div>
        <div class="rm-inline-type-row">
          ${Object.entries(ANNOTATION_TYPES).map(([k, v]) => 
            `<button class="rm-type-btn" data-type="${k}" style="color:${v.color};border-color:${v.color}33;" title="${v.desc}">${v.label}</button>`
          ).join('')}
        </div>
        <textarea class="rm-inline-input" placeholder="Your professional observation about this specific point…" rows="3"></textarea>
        <div class="rm-inline-actions">
          <button class="rm-add-note-btn">Add Note</button>
          <button class="rm-cancel-note-btn">Cancel</button>
        </div>
      `;
      wrapper.appendChild(noteBox);

      let selectedType = 'extend';
      noteBox.querySelectorAll('.rm-type-btn').forEach(btn => {
        if (btn.dataset.type === 'extend') btn.classList.add('selected');
        btn.addEventListener('click', () => {
          noteBox.querySelectorAll('.rm-type-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          btn.style.background = ANNOTATION_TYPES[btn.dataset.type].color + '22';
          selectedType = btn.dataset.type;
        });
      });

      noteBox.querySelector('.rm-add-note-btn').addEventListener('click', () => {
        const text = noteBox.querySelector('.rm-inline-input').value.trim();
        if (!text) return;
        paragraphNotes.push({ paragraph: paraNum, type: selectedType, note: text });
        noteBox.classList.remove('open');
        if (activeTab === 'notes') renderNotesTab();
        updateNotePreview();
        // Flash the notes tab
        const noteTab = document.querySelector('.rm-tab[data-tab=notes]');
        if (noteTab) {
          noteTab.style.color = '#2E9B6F';
          setTimeout(() => { noteTab.style.color = ''; }, 1000);
        }
        const cnt = document.getElementById('rm-note-count');
        if (cnt) cnt.textContent = `(${paragraphNotes.length})`;
      });

      noteBox.querySelector('.rm-cancel-note-btn').addEventListener('click', () => {
        noteBox.classList.remove('open');
      });
    }

    noteBox.classList.add('open');
    noteBox.querySelector('.rm-inline-input').focus();
  }

  // ─── Submit Assessment ────────────────────────────────────────────────────
  async function submitAssessment() {
    const btn = document.getElementById('rm-submit-btn');
    const commentary = document.getElementById('rm-commentary').value.trim();
    const feedbackEl = document.getElementById('rm-feedback');

    if (!commentary) {
      showFeedback('Please enter overall commentary before submitting.', feedbackEl);
      return;
    }

    const allScores = Object.values(scores);
    const unscored = allScores.filter(s => s === 0).length;
    if (unscored > 2) {
      showFeedback('Please rate at least 3 dimensions before submitting.', feedbackEl);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';
    if (feedbackEl) feedbackEl.style.display = 'none';

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleSlug,
          commentary,
          scores,
          paragraphNotes
        })
      });

      const data = await res.json();

      if (res.status === 400 && data.error === 'quality_gate') {
        showFeedback(data.feedback || 'Your submission needs more specificity. Please include at least one concrete local insight, data point, or named market example.', feedbackEl);
        btn.disabled = false;
        btn.textContent = '✓ Submit Peer Assessment';
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Submission failed');

      // Success — show share panel
      showSharePanel(data.validation);
      fetchLiveFeed();

    } catch(err) {
      showFeedback(`Submission error: ${err.message}`, feedbackEl);
      btn.disabled = false;
      btn.textContent = '✓ Submit Peer Assessment';
    }
  }

  function showFeedback(msg, el) {
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<div class="rm-feedback-label">Submission Feedback</div>${msg}`;
  }

  // ─── Share Panel ──────────────────────────────────────────────────────────
  function showSharePanel(validation) {
    // Hide assess tab, show share tab
    document.getElementById('rm-tab-assess').style.display = 'none';
    document.getElementById('rm-tab-share').style.display = '';
    activeTab = 'share';

    // Update tab indicators
    document.querySelectorAll('.rm-tab').forEach(t => t.classList.remove('active'));

    const articleUrl = window.location.href;
    const articleTitle = document.title || 'GROUND Signal';

    document.getElementById('rm-tab-share').innerHTML = `
      <div class="rm-share-panel">
        <div class="rm-share-title">Assessment submitted ✓</div>
        <div class="rm-share-sub">Your peer assessment has been added to the GROUND Signal record. Share it to build the conversation.</div>

        <button class="rm-share-btn" id="rm-copy-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Copy article link
        </button>
        <button class="rm-share-btn" id="rm-share-linkedin">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
          Post on LinkedIn
        </button>
        <button class="rm-share-btn" id="rm-share-twitter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          Post on 𝕏
        </button>

        <div style="margin-top:24px;border-top:1px solid #1a1a1a;padding-top:20px;">
          <a href="/dashboard/" style="font-size:13px;color:#2E9B6F;text-decoration:none;font-weight:600;">View my assessment history →</a>
        </div>
      </div>
    `;

    document.getElementById('rm-copy-link').addEventListener('click', () => {
      navigator.clipboard.writeText(articleUrl).then(() => {
        document.getElementById('rm-copy-link').textContent = '✓ Copied!';
        setTimeout(() => { document.getElementById('rm-copy-link').textContent = 'Copy article link'; }, 2000);
      });
    });

    document.getElementById('rm-share-linkedin').addEventListener('click', () => {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`, '_blank');
    });

    document.getElementById('rm-share-twitter').addEventListener('click', () => {
      const text = `I just peer reviewed this GROUND Signal: "${articleTitle}" — structured professional assessment powered by @INKluSo`;
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(articleUrl)}`, '_blank');
    });
  }

  // ─── Load existing validations for article header ─────────────────────────
  async function loadExistingValidations() {
    try {
      const res = await fetch(`/api/validations?slug=${articleSlug}`);
      const data = await res.json();
      const validations = data.validations || [];
      const state = data.assessmentState || 'UNREVIEWED';
      const sci = data.computedSCI;
      const stateInfo = ASSESSMENT_STATES[state] || ASSESSMENT_STATES.UNREVIEWED;

      if (validations.length > 0) {
        updateArticleBadge(validations, state, stateInfo, sci);
        const activityEl = document.getElementById('vb-activity');
        const countEl = document.getElementById('vb-count');
        if (activityEl) activityEl.style.display = 'flex';
        if (countEl) countEl.textContent = validations.length;
      }
    } catch(e) {}
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    articleSlug = getSlug();
    await checkAuth();
    injectStyles();
    buildPanel();
    buildTrigger();
    wrapParagraphs();
    await loadExistingValidations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
