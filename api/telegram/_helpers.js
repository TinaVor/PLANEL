const { createClient } = require('@supabase/supabase-js');

const API_BASE = 'https://api.telegram.org/bot';

function token() { return process.env.TELEGRAM_BOT_TOKEN || ''; }
function configured() { return !!token(); }

const supabaseAdmin = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function authUser(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t || t.length > 4096) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(t);
  if (error || !data?.user) return null;
  return data.user;
}

async function tgApi(method, body = {}) {
  if (!configured()) throw new Error('telegram_not_configured');
  const r = await fetch(`${API_BASE}${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!j.ok) {
    console.error('[tg]', method, j.description || j);
    throw new Error(j.description || 'telegram_api_error');
  }
  return j.result;
}

async function sendMessage(chatId, text, opts = {}) {
  return tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...opts });
}

function generateCode() {
  // 6 цифр, исключая однозначные последовательности
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Загружает привязку пользователя Telegram
async function getTelegramLink(userId) {
  const db = supabaseAdmin();
  try {
    const { data } = await db.from('user_telegram').select('*').eq('user_id', userId).maybeSingle();
    return data || null;
  } catch (e) {
    console.warn('[tg/get] table not available:', e.message);
    return null;
  }
}

async function upsertTelegramLink(userId, patch) {
  const db = supabaseAdmin();
  const payload = { user_id: userId, ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from('user_telegram')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function clearTelegramLink(userId) {
  const db = supabaseAdmin();
  await db.from('user_telegram').delete().eq('user_id', userId);
}

async function findByChatId(chatId) {
  const db = supabaseAdmin();
  const { data } = await db.from('user_telegram').select('*').eq('chat_id', chatId).maybeSingle();
  return data || null;
}

async function findByLinkCode(code) {
  if (!code) return null;
  const db = supabaseAdmin();
  const { data } = await db
    .from('user_telegram')
    .select('*')
    .eq('link_code', code)
    .maybeSingle();
  return data || null;
}

module.exports = {
  configured,
  token,
  tgApi,
  sendMessage,
  generateCode,
  getTelegramLink,
  upsertTelegramLink,
  clearTelegramLink,
  findByChatId,
  findByLinkCode,
  authUser,
  supabaseAdmin
};
