const GIS_CLIENT_ID = '868442661081-9379vam49io358e9s6gsrth08l653og9.apps.googleusercontent.com';
const TOKEN_KEY = 'spp_id_token';

let _token = null;
let _profile = null;
let _pendingCallback = null;

function requireAuth(callback) {
  // Reuse a still-valid token from a previous page load — avoids re-login on refresh
  const stored = _restoreToken();
  if (stored) {
    _token = stored;
    _profile = _decodeJwt(stored);
    callback();
    return;
  }
  if (_token) { callback(); return; }

  _pendingCallback = callback;
  const showWall = () => {
    const wall = document.getElementById('auth-wall');
    if (wall) wall.style.display = 'flex';
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showWall);
  } else {
    showWall();
  }
}

// Called by GIS script onload
function initGIS() {
  google.accounts.id.initialize({
    client_id: GIS_CLIENT_ID,
    callback: _handleCredential,
    auto_select: true,
  });
  // Already authenticated via a stored token — no need to prompt
  if (_token) return;
  const btnEl = document.getElementById('gsi-btn');
  if (btnEl) {
    google.accounts.id.renderButton(btnEl, {
      theme: 'outline',
      size: 'large',
      locale: 'ms',
      text: 'signin_with',
    });
  }
  google.accounts.id.prompt();
}

function _handleCredential(response) {
  _token = response.credential;
  _profile = _decodeJwt(_token);
  try { localStorage.setItem(TOKEN_KEY, _token); } catch (e) { /* storage blocked */ }
  const wall = document.getElementById('auth-wall');
  if (wall) wall.style.display = 'none';
  if (_pendingCallback) {
    const cb = _pendingCallback;
    _pendingCallback = null;
    cb();
  }
}

// Returns a stored token only if it exists and is not expiring within 60s
function _restoreToken() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    const p = _decodeJwt(t);
    if (!p || !p.exp) return null;
    if (p.exp * 1000 < Date.now() + 60000) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t;
  } catch (e) {
    return null;
  }
}

// Clears the session — call when the server rejects an expired token
function clearAuth() {
  _token = null;
  _profile = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

/**
 * Logs out the current user and reloads so the next student can sign in.
 * disableAutoSelect() stops Google from silently re-picking the same account.
 */
function switchUser() {
  clearAuth();
  try {
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
  } catch (e) { /* GIS not ready */ }
  location.reload();
}

// Decodes the JWT payload (client-side, for display only — server re-verifies)
function _decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function getAuthToken() {
  return _token;
}

function getUserName() {
  return _profile ? _profile.name : '';
}

function getUserEmail() {
  return _profile ? _profile.email : '';
}

// Matric no = local part of the UiTM email (e.g. 2020388517@student.uitm.edu.my)
function getStudentId() {
  const email = getUserEmail();
  return email ? email.split('@')[0] : '';
}

// ─── Shared button loading spinner ─────────────────────────────────────────────

(function injectBtnSpinnerCSS() {
  const style = document.createElement('style');
  style.textContent =
    '.btn-spin{display:inline-block;width:14px;height:14px;vertical-align:-2px;margin-right:6px;' +
    'border:2px solid currentColor;border-right-color:transparent;border-radius:50%;' +
    'animation:btnspin 0.6s linear infinite}' +
    '@keyframes btnspin{to{transform:rotate(360deg)}}';
  (document.head || document.documentElement).appendChild(style);
})();

/**
 * Toggles an inline spinner + disabled state on a button.
 * Preserves the original label and restores it when loading ends.
 */
function setBtnLoading(btn, loading, loadingText) {
  if (!btn) return;
  if (loading) {
    if (btn.dataset.label === undefined) btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spin"></span>' + (loadingText || '');
  } else {
    btn.disabled = false;
    if (btn.dataset.label !== undefined) {
      btn.innerHTML = btn.dataset.label;
      delete btn.dataset.label;
    }
  }
}
