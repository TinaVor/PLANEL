const { createClient } = require('@supabase/supabase-js');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email'
];

function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}/api/google/callback`;
}

function buildAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state
  });
  return `${AUTH_URL}?${params}`;
}

async function exchangeCode(code, redirectUri) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  return await r.json();
}

async function refreshAccess(refresh_token) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });
  return await r.json();
}

async function revokeToken(token) {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch (e) {
    console.error('[google] revoke failed:', e.message);
  }
}

async function fetchGoogleEmail(access_token) {
  const r = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.email || null;
}

const supabaseAdmin = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || token.length > 4096) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function saveGoogleTokens(userId, userMeta, patch) {
  const merged = { ...(userMeta?.google || {}), ...patch, updated_at: new Date().toISOString() };
  const newMeta = { ...(userMeta || {}), google: merged };
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { user_metadata: newMeta });
  if (error) throw new Error(error.message);
  return merged;
}

async function clearGoogleTokens(userId, userMeta) {
  const newMeta = { ...(userMeta || {}) };
  delete newMeta.google;
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { user_metadata: newMeta });
  if (error) throw new Error(error.message);
}

async function ensureFreshAccess(user) {
  const g = user.user_metadata?.google;
  if (!g?.refresh_token) return null;
  const now = Date.now();
  if (g.access_token && g.expires_at && g.expires_at > now + 60_000) return g;

  const refreshed = await refreshAccess(g.refresh_token);
  if (!refreshed.access_token) {
    console.error('[google] refresh failed:', refreshed);
    return null;
  }
  return await saveGoogleTokens(user.id, user.user_metadata, {
    access_token: refreshed.access_token,
    expires_at: now + ((refreshed.expires_in || 3600) * 1000)
  });
}

module.exports = {
  configured,
  getRedirectUri,
  buildAuthUrl,
  exchangeCode,
  refreshAccess,
  revokeToken,
  fetchGoogleEmail,
  authUser,
  saveGoogleTokens,
  clearGoogleTokens,
  ensureFreshAccess,
  supabaseAdmin,
  SCOPES
};
