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

// Загружает Google-токены пользователя.
// Сначала пытается из таблицы user_google_tokens (предпочтительно, RLS-защищено),
// при ошибке/отсутствии падает на user_metadata.google (старый путь).
async function loadGoogleTokens(user) {
  const db = supabaseAdmin();
  try {
    const { data, error } = await db
      .from('user_google_tokens')
      .select('access_token, refresh_token, expires_at, email, connected_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error && data) return data;
  } catch (e) {
    console.warn('[google] table not available, fallback to user_metadata:', e.message);
  }
  return user.user_metadata?.google || null;
}

async function saveGoogleTokens(userId, userMeta, patch) {
  const db = supabaseAdmin();
  // Загружаем существующее, чтобы patch был инкрементальным
  let existing = null;
  try {
    const { data } = await db.from('user_google_tokens').select('*').eq('user_id', userId).maybeSingle();
    existing = data;
  } catch {}
  const base = existing || (userMeta?.google || {});
  const merged = { ...base, ...patch, user_id: userId, updated_at: new Date().toISOString() };

  // Пытаемся в таблицу
  let savedToTable = false;
  try {
    const { error } = await db.from('user_google_tokens').upsert(merged, { onConflict: 'user_id' });
    if (!error) savedToTable = true;
    else console.warn('[google] table upsert failed:', error.message);
  } catch (e) {
    console.warn('[google] table not available:', e.message);
  }

  // Fallback: пишем в user_metadata
  if (!savedToTable) {
    const { user_id, ...metaCopy } = merged;
    const newMeta = { ...(userMeta || {}), google: metaCopy };
    const { error } = await db.auth.admin.updateUserById(userId, { user_metadata: newMeta });
    if (error) throw new Error(error.message);
  }
  return merged;
}

async function clearGoogleTokens(userId, userMeta) {
  const db = supabaseAdmin();
  // Очищаем оба места
  try { await db.from('user_google_tokens').delete().eq('user_id', userId); } catch {}
  if (userMeta?.google) {
    const newMeta = { ...(userMeta || {}) };
    delete newMeta.google;
    const { error } = await db.auth.admin.updateUserById(userId, { user_metadata: newMeta });
    if (error) throw new Error(error.message);
  }
}

async function ensureFreshAccess(user) {
  const g = await loadGoogleTokens(user);
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
  loadGoogleTokens,
  saveGoogleTokens,
  clearGoogleTokens,
  ensureFreshAccess,
  supabaseAdmin,
  SCOPES
};
