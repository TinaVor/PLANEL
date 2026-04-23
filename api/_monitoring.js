// Мониторинг: ошибки → Supabase (персистентно), статистика запросов → in-memory
// (высокочастотно и для оперативной картины «здесь и сейчас» БД не нужна).
// В случае недоступности БД ошибки тоже валятся в in-memory как fallback,
// чтобы хоть что-то увидеть в админке.

const { createClient } = require('@supabase/supabase-js');

const MAX_ERRORS = 500;
const MAX_REQ_LOG = 5000;

const errors = []; // fallback-буфер: {ts, kind, message, ..., count, fingerprint}
const requests = []; // {ts, method, path, status, ms, ip, ua}

let _db = null;
function db() {
  if (_db) return _db;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _db;
}

function fingerprint(e) {
  return [e.kind || 'js', (e.message || '').slice(0, 200), (e.source || '').slice(0, 120), e.line || '', e.col || ''].join('|');
}

function pushError(entry) {
  const e = {
    ts: entry.ts || Date.now(),
    kind: entry.kind || 'js',
    message: String(entry.message || '').slice(0, 1000),
    source: String(entry.source || '').slice(0, 300),
    line: entry.line || null,
    col: entry.col || null,
    stack: String(entry.stack || '').slice(0, 4000),
    url: String(entry.url || '').slice(0, 500),
    ua: String(entry.ua || '').slice(0, 300),
    user_id: entry.user_id || null,
    user_email: String(entry.user_email || '').slice(0, 200),
    ip: String(entry.ip || '').slice(0, 60),
    count: 1,
  };
  e.fingerprint = fingerprint(e);

  // 1) Пишем в БД асинхронно (fire-and-forget — не блокируем хендлер)
  const client = db();
  if (client) {
    client.from('error_log').insert({
      ts: new Date(e.ts).toISOString(),
      kind: e.kind,
      message: e.message,
      source: e.source,
      line: e.line,
      col: e.col,
      stack: e.stack,
      url: e.url,
      ua: e.ua,
      user_id: e.user_id,
      user_email: e.user_email || null,
      fingerprint: e.fingerprint,
      ip: e.ip || null,
    }).then(({ error }) => {
      if (error) console.error('[monitoring] error_log insert failed:', error.message);
    }).catch(err => console.error('[monitoring] error_log insert exception:', err.message));
  }

  // 2) Параллельно копим в in-memory как кеш для свежей картинки и fallback,
  //    если БД упала. Дедуп по fingerprint.
  const existing = errors.find(x => x.fingerprint === e.fingerprint);
  if (existing) {
    existing.count++;
    existing.ts = e.ts;
    existing.url = e.url || existing.url;
    existing.user_email = e.user_email || existing.user_email;
    return existing;
  }
  errors.unshift(e);
  if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS;
  return e;
}

function pushRequest(entry) {
  requests.unshift({
    ts: entry.ts || Date.now(),
    method: entry.method || 'GET',
    path: String(entry.path || '').slice(0, 200),
    status: entry.status || 0,
    ms: entry.ms || 0,
    ip: String(entry.ip || '').slice(0, 60),
    ua: String(entry.ua || '').slice(0, 200),
  });
  if (requests.length > MAX_REQ_LOG) requests.length = MAX_REQ_LOG;
}

// Синхронный fallback — отдаёт in-memory.
function getErrors({ limit = 100, sinceMs = null } = {}) {
  const list = sinceMs ? errors.filter(e => e.ts >= sinceMs) : errors;
  return list.slice(0, limit);
}

// Асинхронный «правильный» путь — из БД, с агрегацией по fingerprint.
// Если БД недоступна / ошибка — падаем на in-memory.
async function getErrorsFromDb({ limit = 200, sinceMs = null } = {}) {
  const client = db();
  if (!client) return { source: 'memory', errors: getErrors({ limit, sinceMs }) };
  try {
    let q = client.from('error_log').select('*').order('ts', { ascending: false }).limit(2000);
    if (sinceMs) q = q.gte('ts', new Date(sinceMs).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    // Агрегируем на сервере: группируем по fingerprint, считаем count, берём свежий ts/url/user
    const byFp = new Map();
    for (const r of (data || [])) {
      const ts = new Date(r.ts).getTime();
      const ex = byFp.get(r.fingerprint);
      if (ex) {
        ex.count++;
        if (ts > ex.ts) {
          ex.ts = ts;
          ex.url = r.url || ex.url;
          ex.user_email = r.user_email || ex.user_email;
          ex.message = r.message || ex.message;
        }
      } else {
        byFp.set(r.fingerprint, {
          ts, kind: r.kind, message: r.message, source: r.source,
          line: r.line, col: r.col, stack: r.stack, url: r.url,
          ua: r.ua, user_id: r.user_id, user_email: r.user_email,
          fingerprint: r.fingerprint, count: 1,
        });
      }
    }
    const aggregated = Array.from(byFp.values()).sort((a, b) => b.ts - a.ts).slice(0, limit);
    return { source: 'db', errors: aggregated, raw_total: (data || []).length };
  } catch (e) {
    console.error('[monitoring] getErrorsFromDb failed, falling back to memory:', e.message);
    return { source: 'memory', errors: getErrors({ limit, sinceMs }), db_error: e.message };
  }
}

function getStats() {
  const now = Date.now();
  const w = (ms) => requests.filter(r => now - r.ts <= ms);
  const calc = (arr) => {
    if (!arr.length) return { count: 0, avg_ms: 0, p95_ms: 0, errors: 0, error_rate: 0 };
    const sortedMs = arr.map(r => r.ms).sort((a, b) => a - b);
    const sum = arr.reduce((s, r) => s + r.ms, 0);
    const p95 = sortedMs[Math.floor(sortedMs.length * 0.95)] || sortedMs[sortedMs.length - 1];
    const errs = arr.filter(r => r.status >= 500).length;
    return {
      count: arr.length,
      avg_ms: Math.round(sum / arr.length),
      p95_ms: p95,
      errors: errs,
      error_rate: Math.round((errs / arr.length) * 1000) / 10,
    };
  };
  return {
    last_1m: calc(w(60_000)),
    last_5m: calc(w(5 * 60_000)),
    last_1h: calc(w(60 * 60_000)),
    total_logged_requests: requests.length,
  };
}

function getTopPaths(windowMs = 60 * 60_000, top = 10) {
  const now = Date.now();
  const counts = new Map();
  requests.forEach(r => {
    if (now - r.ts > windowMs) return;
    const key = `${r.method} ${r.path.replace(/\/[0-9a-f-]{8,}/gi, '/:id')}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([path, count]) => ({ path, count }));
}

module.exports = {
  pushError,
  pushRequest,
  getErrors,
  getErrorsFromDb,
  getStats,
  getTopPaths,
  MAX_ERRORS,
  MAX_REQ_LOG,
};
