const style = document.createElement('style');
style.textContent = `
  .nav-auth { display: flex; align-items: center; }
  .nav-auth-btn { padding: 6px 16px; border-radius: 4px; font-size: 13px; font-weight: 600; text-decoration: none; letter-spacing: 0.05em; transition: opacity 0.2s; }
  .nav-auth-btn:hover { opacity: 0.8; }
  .nav-login { background: #2D6BE4; color: white; }
  .nav-dashboard { background: transparent; color: #a0a0c0; border: 1px solid #333355; }
  .auth-gate { text-align: center; padding: 40px 24px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; margin-top: 24px; }
  .auth-gate-icon { font-size: 32px; margin-bottom: 12px; }
  .auth-gate-title { color: #ffffff; font-size: 18px; margin: 0 0 8px; }
  .auth-gate-text { color: #a0a0b8; font-size: 14px; margin: 0 0 20px; }
  .auth-gate-btn { display: inline-block; background: #2D6BE4; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .auth-gate-signup { color: #666680; font-size: 13px; margin-top: 16px; }
  .auth-gate-signup a { color: #2D6BE4; text-decoration: none; }
  .contributor-banner { background: rgba(45,107,228,0.12); border: 1px solid rgba(45,107,228,0.3); border-radius: 6px; padding: 10px 16px; margin-bottom: 16px; }
  .contributor-banner-text { color: #a0b8e8; font-size: 13px; }
  .contributor-banner strong { color: #ffffff; }
  #validationForm input[readonly], #validationForm textarea[readonly] { opacity: 0.6; cursor: not-allowed; }
`;
document.head.appendChild(style);

(async function () {
  const API_BASE = window.GROUND_API_BASE || '';
  let currentUser = null;

  // Check auth
  try {
    const res = await fetch(API_BASE + '/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) currentUser = data.user;
    }
  } catch (e) {}

  // Inject nav auth link
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    const authEl = document.createElement('div');
    authEl.className = 'nav-auth';
    if (currentUser) {
      authEl.innerHTML = `<a href="${API_BASE}/dashboard/" class="nav-auth-btn nav-dashboard">Dashboard</a>`;
    } else {
      authEl.innerHTML = `<a href="${API_BASE}/login/" class="nav-auth-btn nav-login">Login</a>`;
    }
    navLinks.parentNode.insertBefore(authEl, navLinks.nextSibling);
  }

  // Auth-gate validation form
  const formContainer = document.getElementById('validation-form-container');
  if (!formContainer) return;

  if (!currentUser) {
    formContainer.innerHTML = `
      <div class="auth-gate">
        <div class="auth-gate-icon">🔒</div>
        <h4 class="auth-gate-title">Contributors Only</h4>
        <p class="auth-gate-text">You must be a registered contributor to submit a validation.</p>
        <a href="${API_BASE}/login/" class="auth-gate-btn">Login to Validate</a>
        <p class="auth-gate-signup">Not registered? <a href="${API_BASE}/signup/">Apply to become a contributor →</a></p>
      </div>
    `;
  } else {
    const nameField = document.querySelector('#validationForm [name="name"]');
    const titleField = document.querySelector('#validationForm [name="title"]');
    const orgField = document.querySelector('#validationForm [name="org"]');
    const yearsField = document.querySelector('#validationForm [name="years"]');
    if (nameField) { nameField.value = currentUser.name; nameField.readOnly = true; }
    if (titleField) { titleField.value = currentUser.title; titleField.readOnly = true; }
    if (orgField) { orgField.value = currentUser.org; orgField.readOnly = true; }
    if (yearsField) { yearsField.value = currentUser.yearsExp; yearsField.readOnly = true; }

    const banner = document.createElement('div');
    banner.className = 'contributor-banner';
    banner.innerHTML = `<span class="contributor-banner-text">Validating as <strong>${currentUser.name}</strong> · ${currentUser.title}, ${currentUser.org}</span>`;
    formContainer.insertBefore(banner, formContainer.firstChild);
  }
})();