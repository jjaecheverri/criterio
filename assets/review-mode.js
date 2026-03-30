/* GROUND Review Mode — ground.in-kluso.com */
(function () {
  'use strict';

  // Derive article slug from URL path
  const slug = window.location.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '--');
  const verticalColor = (() => {
    const path = window.location.pathname;
    if (path.startsWith('/real-estate')) return '#2D6BE4';
    if (path.startsWith('/retail'))      return '#C4317A';
    if (path.startsWith('/brand'))       return '#E8602C';
    if (path.startsWith('/food'))        return '#2E9B6F';
    if (path.startsWith('/family'))      return '#C9A84C';
    return '#2D6BE4';
  })();

  let currentUser = null;
  let paragraphNotes = {}; // index → {excerpt, note}
  let reviewMode = false;
  let liveInterval = null;

  /* ─────────────────────────────────────────
     1. INIT — check auth, then wire everything
  ───────────────────────────────────────── */
  async function init() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        currentUser = await res.json();
      }
    } catch (e) {}

    injectStyles();
    injectReviewButton();
    loadExistingValidations();
  }

  /* ─────────────────────────────────────────
     2. STYLES
  ───────────────────────────────────────── */
  function injectStyles() {
    const css = `
      /* Review button */
      #ground-review-btn {
        display: inline-flex; align-items: center; gap: 8px;
        background: ${verticalColor}; color: #fff;
        border: none; padding: 12px 24px; border-radius: 3px;
        font-family: 'JetBrains Mono', monospace; font-size: 12px;
        letter-spacing: 1.5px; text-transform: uppercase;
        cursor: pointer; margin: 24px 0 0; font-weight: 600;
        transition: opacity .2s;
      }
      #ground-review-btn:hover { opacity: .85; }
      #ground-review-btn svg { width:16px; height:16px; }

      /* Review mode layout */
      body.review-active { overflow-x: hidden; }
      #review-panel {
        position: fixed; top: 0; right: 0; width: 360px; height: 100vh;
        background: #FAFAF8; border-left: 2px solid ${verticalColor};
        z-index: 1000; display: flex; flex-direction: column;
        box-shadow: -4px 0 24px rgba(0,0,0,.12);
        transform: translateX(100%); transition: transform .3s ease;
      }
      #review-panel.open { transform: translateX(0); }
      body.review-active .article-body,
      body.review-active .validation-stack { margin-right: 380px; }

      /* Panel header */
      #rp-header {
        padding: 20px 20px 0;
        border-bottom: 1px solid #e8e4dc;
      }
      #rp-header .rp-label {
        font-family: 'JetBrains Mono', monospace; font-size: 10px;
        letter-spacing: 2px; text-transform: uppercase;
        color: ${verticalColor}; font-weight: 600; margin-bottom: 4px;
      }
      #rp-header .rp-title {
        font-family: 'DM Serif Display', serif; font-size: 18px;
        margin: 0 0 12px; color: #1a1a1a;
      }
      #rp-tabs { display: flex; gap: 0; }
      .rp-tab {
        flex: 1; padding: 10px 0; text-align: center;
        font-family: 'JetBrains Mono', monospace; font-size: 10px;
        letter-spacing: 1px; text-transform: uppercase;
        cursor: pointer; border-bottom: 2px solid transparent;
        color: #888; transition: all .2s;
      }
      .rp-tab.active { color: ${verticalColor}; border-bottom-color: ${verticalColor}; }

      /* Panel body */
      #rp-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

      /* Live feed entries */
      .lf-entry {
        border-left: 3px solid ${verticalColor}; padding: 12px 12px 12px 14px;
        margin-bottom: 12px; background: #fff;
        border-radius: 0 3px 3px 0;
        box-shadow: 0 1px 4px rgba(0,0,0,.06);
      }
      .lf-name { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; }
      .lf-meta { font-family: 'Inter', sans-serif; font-size: 11px; color: #888; margin: 2px 0 6px; }
      .lf-text { font-family: 'Inter', sans-serif; font-size: 13px; color: #333; line-height: 1.5; }
      .lf-para-note {
        margin-top: 8px; padding: 8px 10px;
        background: #f5f3ee; border-radius: 2px;
        font-family: 'Inter', sans-serif; font-size: 12px;
        color: #555; line-height: 1.5;
      }
      .lf-para-note .pn-excerpt { font-style: italic; color: #888; font-size: 11px; margin-bottom: 4px; }

      /* Notes tab */
      .note-item {
        margin-bottom: 12px; padding: 12px;
        background: #fff; border: 1px solid #e8e4dc; border-radius: 3px;
      }
      .note-item .ni-excerpt {
        font-family: 'Inter', sans-serif; font-size: 11px;
        color: #888; font-style: italic; margin-bottom: 6px;
      }
      .note-item .ni-note {
        font-family: 'Inter', sans-serif; font-size: 13px;
        color: #333; line-height: 1.5;
      }
      .note-item .ni-del {
        float: right; cursor: pointer; color: #ccc;
        font-size: 16px; line-height: 1; margin-top: -2px;
      }
      .note-item .ni-del:hover { color: #e44; }
      .notes-empty {
        font-family: 'Inter', sans-serif; font-size: 13px;
        color: #aaa; text-align: center; padding: 32px 0;
      }

      /* Validate button */
      #rp-footer { padding: 16px 20px; border-top: 1px solid #e8e4dc; }
      #ground-validate-btn {
        width: 100%; padding: 16px; background: ${verticalColor};
        color: #fff; border: none; border-radius: 3px;
        font-family: 'JetBrains Mono', monospace; font-size: 13px;
        letter-spacing: 2px; text-transform: uppercase;
        cursor: pointer; font-weight: 700; transition: opacity .2s;
      }
      #ground-validate-btn:hover { opacity: .85; }
      #ground-validate-btn:disabled { opacity: .5; cursor: not-allowed; }
      #validate-note-wrap { margin-bottom: 12px; }
      #validate-note-wrap label {
        font-family: 'JetBrains Mono', monospace; font-size: 10px;
        letter-spacing: 1.5px; text-transform: uppercase; color: #888;
        display: block; margin-bottom: 6px;
      }
      #validate-commentary {
        width: 100%; padding: 10px; border: 1px solid #ddd;
        border-radius: 3px; font-family: 'Inter', sans-serif;
        font-size: 13px; resize: vertical; min-height: 80px;
        box-sizing: border-box;
      }

      /* Paragraph annotation button */
      .para-wrap { position: relative; }
      .para-annotate-btn {
        position: absolute; left: -32px; top: 50%; transform: translateY(-50%);
        width: 24px; height: 24px; border-radius: 50%;
        background: ${verticalColor}; color: #fff; border: none;
        font-size: 16px; line-height: 1; cursor: pointer;
        opacity: 0; transition: opacity .2s; display: flex;
        align-items: center; justify-content: center;
        font-family: monospace;
      }
      .para-wrap:hover .para-annotate-btn { opacity: 1; }
      .para-has-note .para-annotate-btn { opacity: 1; background: #2E9B6F; }
      .para-annotation-box {
        background: #fff9f0; border: 1px solid ${verticalColor};
        border-radius: 3px; padding: 12px; margin: 8px 0;
      }
      .para-annotation-box textarea {
        width: 100%; border: 1px solid #ddd; border-radius: 2px;
        padding: 8px; font-family: 'Inter', sans-serif; font-size: 13px;
        resize: vertical; min-height: 64px; box-sizing: border-box;
      }
      .pab-actions { display: flex; gap: 8px; margin-top: 8px; }
      .pab-save {
        padding: 6px 14px; background: ${verticalColor}; color: #fff;
        border: none; border-radius: 2px; font-family: 'JetBrains Mono', monospace;
        font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
        cursor: pointer;
      }
      .pab-cancel {
        padding: 6px 14px; background: transparent; color: #888;
        border: 1px solid #ddd; border-radius: 2px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
        cursor: pointer;
      }

      /* Success share panel */
      #share-panel {
        position: fixed; bottom: 24px; right: 24px; z-index: 2000;
        background: #1a1a1a; color: #fff; padding: 24px 28px;
        border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,.3);
        max-width: 340px; display: none;
      }
      #share-panel.visible { display: block; animation: slideUp .3s ease; }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      #share-panel .sp-title {
        font-family: 'JetBrains Mono', monospace; font-size: 11px;
        letter-spacing: 2px; text-transform: uppercase;
        color: ${verticalColor}; margin-bottom: 8px;
      }
      #share-panel .sp-msg {
        font-family: 'Inter', sans-serif; font-size: 14px;
        line-height: 1.5; margin-bottom: 16px; color: #eee;
      }
      #share-panel .sp-btns { display: flex; gap: 8px; flex-wrap: wrap; }
      .sp-btn {
        padding: 8px 14px; border-radius: 3px; border: none;
        font-family: 'JetBrains Mono', monospace; font-size: 10px;
        letter-spacing: 1px; text-transform: uppercase;
        cursor: pointer; transition: opacity .2s;
      }
      .sp-btn:hover { opacity: .85; }
      .sp-btn.copy   { background: #fff; color: #1a1a1a; }
      .sp-btn.li     { background: #0A66C2; color: #fff; }
      .sp-btn.tw     { background: #000; color: #fff; }
      #share-panel .sp-close {
        float: right; cursor: pointer; color: #666;
        font-size: 18px; margin-top: -4px;
      }

      /* Panel close button */
      #rp-close {
        position: absolute; top: 16px; right: 16px;
        background: none; border: none; cursor: pointer;
        font-size: 20px; color: #888; line-height: 1;
      }
      #rp-close:hover { color: #333; }

      /* Live dot */
      .live-dot {
        display: inline-block; width: 7px; height: 7px;
        background: #2E9B6F; border-radius: 50%;
        margin-right: 5px; animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; } 50% { opacity: .4; }
      }
          .lf-synthesis {
        background: rgba(201,168,76,0.06); border: 1px solid rgba(201,168,76,0.25);
        border-radius: 4px; padding: 16px 18px; margin-bottom: 14px;
      }
      .lf-synthesis-label {
        font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
        letter-spacing: 0.1em; color: #C9A84C; text-transform: uppercase; margin-bottom: 10px;
      }
      .lf-synthesis-body { font-size: 13px; line-height: 1.7; color: #c8c5bc; }
      .lf-synthesis-body p { margin-bottom: 8px; }
      .lf-synthesis-meta { font-size: 11px; color: #555; margin-top: 8px; font-style: italic; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────
     3. REVIEW BUTTON
  ───────────────────────────────────────── */
  function injectReviewButton() {
    const header = document.querySelector('.article-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = 'ground-review-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      ${currentUser ? 'Review & Validate' : 'Review Article'}`;
    btn.onclick = currentUser ? enterReviewMode : () => { window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname); };
    header.appendChild(btn);
  }

  /* ─────────────────────────────────────────
     4. ENTER REVIEW MODE
  ───────────────────────────────────────── */
  function enterReviewMode() {
    if (reviewMode) return;
    reviewMode = true;

    // Hide the existing validation form (we have our own now)
    const vs = document.getElementById('validations-section');
    if (vs) vs.style.opacity = '0.3';

    // Build the side panel
    const panel = document.createElement('div');
    panel.id = 'review-panel';
    panel.innerHTML = `
      <button id="rp-close" onclick="document.getElementById('review-panel').classList.remove('open'); document.body.classList.remove('review-active');" title="Close">✕</button>
      <div id="rp-header">
        <div class="rp-label">GROUND SIGNAL</div>
        <div class="rp-title">Review Mode</div>
        <div id="rp-tabs">
          <div class="rp-tab active" data-tab="feed" onclick="switchTab('feed')"><span class="live-dot"></span>Live Feed</div>
          <div class="rp-tab" data-tab="notes" onclick="switchTab('notes')">My Notes</div>
        </div>
      </div>
      <div id="rp-body">
        <div id="tab-feed">
          <div id="live-feed-list"><div class="notes-empty">Loading validations…</div></div>
        </div>
        <div id="tab-notes" style="display:none">
          <div id="notes-list"><div class="notes-empty">Click + on any paragraph to add your professional notes.</div></div>
        </div>
      </div>
      <div id="rp-footer">
        <div id="validate-note-wrap">
          <label>Overall Commentary</label>
          <textarea id="validate-commentary" placeholder="Your overall professional assessment of this article…"></textarea>
        </div>
        <button id="ground-validate-btn" onclick="submitValidation()">
          ✓ &nbsp;Validate This Article
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    // Wire tab switching globally
    window.switchTab = function(tab) {
      document.querySelectorAll('.rp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      document.getElementById('tab-feed').style.display = tab === 'feed' ? '' : 'none';
      document.getElementById('tab-notes').style.display = tab === 'notes' ? '' : 'none';
    };

    document.body.classList.add('review-active');
    setTimeout(() => panel.classList.add('open'), 50);

    // Annotate paragraphs
    wrapParagraphs();

    // Start live feed polling
    fetchLiveFeed();
    liveInterval = setInterval(fetchLiveFeed, 30000);
  }

  /* ─────────────────────────────────────────
     5. PARAGRAPH ANNOTATION
  ───────────────────────────────────────── */
  function wrapParagraphs() {
    const body = document.querySelector('.article-body');
    if (!body) return;
    const paras = Array.from(body.querySelectorAll('p, h2, h3'));
    paras.forEach((p, i) => {
      if (!p.textContent.trim()) return;
      const wrap = document.createElement('div');
      wrap.className = 'para-wrap';
      wrap.dataset.idx = i;
      p.parentNode.insertBefore(wrap, p);
      wrap.appendChild(p);

      const btn = document.createElement('button');
      btn.className = 'para-annotate-btn';
      btn.title = 'Add professional note';
      btn.innerHTML = paragraphNotes[i] ? '✎' : '+';
      btn.onclick = () => toggleAnnotation(wrap, i, p.textContent.trim().substring(0, 120));
      wrap.appendChild(btn);
    });
  }

  function toggleAnnotation(wrap, idx, excerpt) {
    // Remove existing box if open
    const existing = wrap.querySelector('.para-annotation-box');
    if (existing) { existing.remove(); return; }

    const note = paragraphNotes[idx] ? paragraphNotes[idx].note : '';
    const box = document.createElement('div');
    box.className = 'para-annotation-box';
    box.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${verticalColor};margin-bottom:8px;">Your Note</div>
      <div style="font-family:'Inter',sans-serif;font-size:11px;color:#888;font-style:italic;margin-bottom:6px;">"${excerpt}…"</div>
      <textarea placeholder="Your professional commentary on this paragraph…">${note}</textarea>
      <div class="pab-actions">
        <button class="pab-save">Save Note</button>
        <button class="pab-cancel">Cancel</button>
      </div>
    `;
    wrap.appendChild(box);

    box.querySelector('.pab-save').onclick = () => {
      const val = box.querySelector('textarea').value.trim();
      if (val) {
        paragraphNotes[idx] = { excerpt, note: val };
        wrap.classList.add('para-has-note');
        wrap.querySelector('.para-annotate-btn').innerHTML = '✎';
        updateNotesTab();
      } else {
        delete paragraphNotes[idx];
        wrap.classList.remove('para-has-note');
        wrap.querySelector('.para-annotate-btn').innerHTML = '+';
        updateNotesTab();
      }
      box.remove();
    };
    box.querySelector('.pab-cancel').onclick = () => box.remove();
  }

  function updateNotesTab() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    const keys = Object.keys(paragraphNotes);
    if (!keys.length) {
      list.innerHTML = '<div class="notes-empty">Click + on any paragraph to add your professional notes.</div>';
      return;
    }
    list.innerHTML = keys.map(i => `
      <div class="note-item">
        <span class="ni-del" onclick="deleteNote(${i})">✕</span>
        <div class="ni-excerpt">"${paragraphNotes[i].excerpt}…"</div>
        <div class="ni-note">${paragraphNotes[i].note}</div>
      </div>
    `).join('');
  }

  window.deleteNote = function(idx) {
    delete paragraphNotes[idx];
    const wrap = document.querySelector(`.para-wrap[data-idx="${idx}"]`);
    if (wrap) {
      wrap.classList.remove('para-has-note');
      const btn = wrap.querySelector('.para-annotate-btn');
      if (btn) btn.innerHTML = '+';
    }
    updateNotesTab();
  };

  /* ─────────────────────────────────────────
     6. LIVE FEED
  ───────────────────────────────────────── */
  async function fetchLiveFeed() {
    try {
      const res = await fetch(`/api/validations?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return;
      const data = await res.json();
      const validations = Array.isArray(data) ? data : (data.validations || []);
      const synthesis   = (data && !Array.isArray(data)) ? (data.synthesis || null) : null;
      renderLiveFeed(validations, synthesis);
    } catch (e) {}
  }

  function renderLiveFeed(validations, synthesis) {
    const list = document.getElementById('live-feed-list');
    if (!list) return;
    let html = '';
    // Level 2 synthesis banner (shown when 2+ professionals stacked)
    if (synthesis && synthesis.synthesis) {
      const synParas = synthesis.synthesis.split(/\n\n+/).filter(Boolean)
        .map(p => '<p>' + p.trim() + '</p>').join('');
      const synNames = (synthesis.validators || []).map(v => v.name).filter(Boolean).join(', ');
      html += '<div class="lf-synthesis">'
        + '<div class="lf-synthesis-label">⬡ GROUND SIGNAL LEVEL 2 — '
        + synthesis.validatorCount + ' Professional' + (synthesis.validatorCount !== 1 ? 's' : '') + ' Stacked</div>'
        + '<div class="lf-synthesis-body">' + synParas + '</div>'
        + (synNames ? '<div class="lf-synthesis-meta">Stacked intelligence from: ' + synNames + '</div>' : '')
        + '</div>';
    }
    if (!validations.length) {
      html += '<div class="notes-empty">No validations yet — be the first!</div>';
      list.innerHTML = html;
      return;
    }
    html += validations.map(v => {
      const paraNotesHtml = (v.paragraphNotes || []).map(pn => `
        <div class="lf-para-note">
          <div class="pn-excerpt">"${pn.excerpt}…"</div>
          ${pn.note}
        </div>
      `).join('');
      const date = v.timestamp ? new Date(v.timestamp).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
      return `
        <div class="lf-entry">
          <div class="lf-name">${v.name || v.contributor_name || 'Professional'}</div>
          <div class="lf-meta">${v.title || ''} ${v.organization ? '· ' + v.organization : ''} ${date ? '· ' + date : ''}</div>
          <div class="lf-text">${v.commentary || ''}</div>
          ${paraNotesHtml}
        </div>
      `;
    }).join('');
    list.innerHTML = html;
  }

  async function loadExistingValidations() {
    // Also load into the existing validations-list on the page
    try {
      const res = await fetch(`/api/validations?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return;
      const data = await res.json();
      const validations = Array.isArray(data) ? data : (data.validations || []);
      // Update static "Unclaimed" placeholders with real validator info
      if (validations.length > 0) {
        const first = validations[0];
        const vName = first.name || 'Professional';
        const vTitle = first.title ? ` · ${first.title}` : '';
        const vOrg = first.organization ? `, ${first.organization}` : '';
        const metaEl = document.getElementById('meta-validator');
        if (metaEl) metaEl.textContent = `Validated by ${vName}${vTitle}${vOrg}`;
        const siEl = document.getElementById('si-validator');
        if (siEl) siEl.textContent = `Validated by ${vName}${vTitle}${vOrg}.`;
        const vbLabel = document.getElementById('vb-label');
        if (vbLabel) vbLabel.textContent = `${validations.length} Validation${validations.length > 1 ? 's' : ''}`;
        const vbName = document.getElementById('vb-name');
        if (vbName) vbName.textContent = `${vName}${vTitle}${vOrg}${validations.length > 1 ? ` + ${validations.length - 1} more` : ''}`;
      }

      const list = document.getElementById('validations-list');
      if (!list || !validations.length) return;
      list.innerHTML = validations.map(v => {
        const date = v.timestamp ? new Date(v.timestamp).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
        const paraHtml = (v.paragraphNotes || []).map(pn => `
          <div style="margin-top:10px;padding:10px 12px;background:#f5f3ee;border-radius:2px;">
            <div style="font-style:italic;font-size:11px;color:#888;margin-bottom:4px;">"${pn.excerpt}…"</div>
            <div style="font-size:13px;color:#444;">${pn.note}</div>
          </div>
        `).join('');
        return `
          <div style="border:1px solid #e8e4dc;padding:20px;margin-bottom:16px;border-radius:3px;background:#fff;">
            <div style="display:flex;gap:12px;align-items:flex-start;">
              <div style="width:36px;height:36px;border-radius:50%;background:${verticalColor};flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 179.4 164.7" xmlns="http://www.w3.org/2000/svg"><polygon fill="#FAF6EE" points="68.5 131.1 140.6 33.6 111.8 33.7 38.9 131.1"/><polygon fill="#FAF6EE" opacity=".3" points="40.3 101.5 160.1 83.5 139.8 63.2 19.3 80.5"/><polygon fill="#FAF6EE" opacity=".5" points="41 61.2 138.5 133.2 138.4 104.5 41 31.5"/><polygon fill="#FAF6EE" opacity=".2" points="70.6 32.9 88.6 152.8 108.9 132.4 91.6 11.9"/></svg>
              </div>
              <div style="flex:1;">
                <div style="font-weight:600;font-family:'Inter',sans-serif;font-size:14px;">${v.name || 'Professional'}</div>
                <div style="font-size:12px;color:#888;font-family:'Inter',sans-serif;">${v.title || ''} ${v.organization ? '· ' + v.organization : ''} ${date ? '· ' + date : ''}</div>
                <div style="margin-top:10px;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#333;">${v.commentary || ''}</div>
                ${paraHtml}
                ${v.ai_commentary ? `<div style="margin-top:12px;padding:10px 14px;border-left:3px solid ${verticalColor};font-family:'Inter',sans-serif;font-size:13px;color:#555;line-height:1.5;">${v.ai_commentary}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {}
  }

  /* ─────────────────────────────────────────
     7. SUBMIT VALIDATION
  ───────────────────────────────────────── */
  window.submitValidation = async function() {
    if (!currentUser) {
      window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname);
      return;
    }
    const commentary = document.getElementById('validate-commentary').value.trim();
    const notesList = Object.values(paragraphNotes);
    if (!commentary && !notesList.length) {
      alert('Please add your overall commentary or at least one paragraph note before validating.');
      return;
    }

    const btn = document.getElementById('ground-validate-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          articleSlug: slug,
          articleTitle: document.querySelector('h1')?.textContent?.trim() || document.title,
          commentary,
          paragraphNotes: notesList
        })
      });

      if (res.ok) {
        btn.textContent = '✓ Validated!';
        btn.style.background = '#2E9B6F';
        showSharePanel();
        fetchLiveFeed();
        loadExistingValidations();
        // Clear notes
        paragraphNotes = {};
        updateNotesTab();
        document.querySelectorAll('.para-has-note').forEach(w => {
          w.classList.remove('para-has-note');
          const ab = w.querySelector('.para-annotate-btn');
          if (ab) ab.innerHTML = '+';
        });
        document.getElementById('validate-commentary').value = '';
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname);
        } else {
          btn.disabled = false;
          btn.textContent = '✓ Validate This Article';
          alert(err.error || 'Submission failed. Please try again.');
        }
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '✓ Validate This Article';
      alert('Network error. Please try again.');
    }
  };

  /* ─────────────────────────────────────────
     8. SHARE PANEL
  ───────────────────────────────────────── */
  function showSharePanel() {
    const url = window.location.href;
    const title = document.querySelector('h1')?.textContent?.trim() || 'GROUND Signal';
    const panel = document.createElement('div');
    panel.id = 'share-panel';
    panel.innerHTML = `
      <span class="sp-close" onclick="this.parentElement.remove()">✕</span>
      <div class="sp-title">✓ Validation Submitted</div>
      <div class="sp-msg">Your professional validation is now live and stacked on this article. Share it!</div>
      <div class="sp-btns">
        <button class="sp-btn copy" onclick="navigator.clipboard.writeText('${url}').then(()=>{this.textContent='Copied!'})">Copy Link</button>
        <button class="sp-btn li" onclick="window.open('https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}','_blank')">LinkedIn</button>
        <button class="sp-btn tw" onclick="window.open('https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent('I just validated: ' + title + ' on GROUND by IN-KluSo')}','_blank')">𝕏 Post</button>
      </div>
    `;
    document.body.appendChild(panel);
    setTimeout(() => panel.classList.add('visible'), 50);
  }

  /* ─────────────────────────────────────────
     BOOT
  ───────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
