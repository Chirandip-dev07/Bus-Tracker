// Centralized API and WebSocket configuration for production.
const BACKEND_RENDER_HOST = 'bus-tracker-backend-myi6.onrender.com';
const IS_LOCAL_HOST = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const API_BASE = IS_LOCAL_HOST
  ? 'http://127.0.0.1:8000'
  : `https://${BACKEND_RENDER_HOST}`;

const WS_BASE = IS_LOCAL_HOST
  ? 'ws://127.0.0.1:8000'
  : `wss://${BACKEND_RENDER_HOST}`;

const REQUEST_TIMEOUT_MS = 15000;

const SESSION_KEYS = {
  passenger: { token: 'passengerToken', profile: 'passengerProfile' },
  driver: { token: 'driverToken', profile: 'driverProfile' },
  admin: { token: 'adminToken', profile: 'adminProfile' }
};

function buildApiUrl(path) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function buildWsUrl(path) {
  return `${WS_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function getSessionKeys(role) {
  return SESSION_KEYS[role];
}

function clearRoleSession(role) {
  const keys = getSessionKeys(role);
  if (!keys) return;
  localStorage.removeItem(keys.token);
  localStorage.removeItem(keys.profile);
}

function redirectToLogin() {
  window.location.href = 'login.html';
}

function getStoredSession(role) {
  const keys = getSessionKeys(role);
  if (!keys) return null;
  const token = localStorage.getItem(keys.token);
  const profileStr = localStorage.getItem(keys.profile);
  if (!token || !profileStr) return null;

  try {
    return { token, profile: JSON.parse(profileStr) };
  } catch (error) {
    clearRoleSession(role);
    return null;
  }
}

function isJwtExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch (error) {
    return false;
  }
}

function requireRoleSession(role) {
  const session = getStoredSession(role);
  if (!session || session.profile.role !== role || isJwtExpired(session.token)) {
    clearRoleSession(role);
    redirectToLogin();
    return null;
  }
  return session;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function getFriendlyError(error) {
  if (error.name === 'AbortError') {
    return 'The server took too long to respond. Please try again.';
  }
  if (!navigator.onLine) {
    return 'You appear to be offline. Please check your internet connection.';
  }
  return error.message || 'Unable to reach the server. Please try again.';
}

function handleUnauthorized(role) {
  if (role) clearRoleSession(role);
  alert('Your session has expired. Please log in again.');
  redirectToLogin();
}

async function apiRequest(path, options = {}, settings = {}) {
  const controller = new AbortController();
  const timeout = settings.timeout || REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const headers = { ...(options.headers || {}) };

  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      headers,
      signal: controller.signal
    });
    const body = await parseResponseBody(response);

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized(settings.role);
      return null;
    }

    if (!response.ok) {
      throw new Error((body && body.detail) || 'Request failed. Please try again.');
    }

    return body;
  } catch (error) {
    throw new Error(getFriendlyError(error));
  } finally {
    clearTimeout(timeoutId);
  }
}
