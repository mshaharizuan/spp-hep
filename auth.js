const GIS_CLIENT_ID = '868442661081-9379vam49io358e9s6gsrth08l653og9.apps.googleusercontent.com';

let _token = null;
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
  document.getElementById('auth-wall').style.display = 'none';
  if (_pendingCallback) {
    const cb = _pendingCallback;
    _pendingCallback = null;
    cb();
  }
}

function getAuthToken() {
  return _token;
}
