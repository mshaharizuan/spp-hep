const GIS_CLIENT_ID = '868442661081-9379vam49io358e9s6gsrth08l653og9.apps.googleusercontent.com';

let _token = null;
let _profile = null;
let _pendingCallback = null;

function requireAuth(callback) {
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
  google.accounts.id.renderButton(document.getElementById('gsi-btn'), {
    theme: 'outline',
    size: 'large',
    locale: 'ms',
    text: 'signin_with',
  });
  google.accounts.id.prompt();
}

function _handleCredential(response) {
  _token = response.credential;
  _profile = _decodeJwt(_token);
  const wall = document.getElementById('auth-wall');
  if (wall) wall.style.display = 'none';
  if (_pendingCallback) {
    const cb = _pendingCallback;
    _pendingCallback = null;
    cb();
  }
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
