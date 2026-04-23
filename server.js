const express = require('express');
const path = require('path');
const fs = require('fs');
const monitoring = require('./api/_monitoring');

console.log('[BOOT] starting PLANEL server');
console.log('[BOOT] __dirname =', __dirname);
console.log('[BOOT] cwd       =', process.cwd());
console.log('[BOOT] node      =', process.version);
console.log('[BOOT] NODE_ENV  =', process.env.NODE_ENV);
console.log('[BOOT] PORT env  =', process.env.PORT);

try {
  const rootFiles = fs.readdirSync(__dirname);
  console.log('[BOOT] root dir contents:', rootFiles.join(', '));
} catch (e) {
  console.error('[BOOT] cannot read __dirname:', e.message);
}

const srcDir = path.join(__dirname, 'src');
console.log('[BOOT] srcDir    =', srcDir);
console.log('[BOOT] srcDir exists?', fs.existsSync(srcDir));
if (fs.existsSync(srcDir)) {
  try {
    console.log('[BOOT] src contents:', fs.readdirSync(srcDir).join(', '));
  } catch (e) {
    console.error('[BOOT] cannot read src:', e.message);
  }
}
const indexHtml = path.join(srcDir, 'index.html');
console.log('[BOOT] index.html exists?', fs.existsSync(indexHtml));

if (fs.existsSync(path.join(__dirname, '.env'))) {
  console.log('[BOOT] loading .env file');
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} else {
  console.log('[BOOT] no .env file (expected on Render — using dashboard env vars)');
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`[BOOT] FATAL: missing env var: ${k}`);
    process.exit(1);
  }
  console.log(`[BOOT] env ${k} = set (length=${process.env[k].length})`);
}

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[REQ] ${req.method} ${req.url} host=${req.headers.host} ua="${(req.headers['user-agent'] || '').slice(0, 60)}"`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[RES] ${req.method} ${req.url} -> ${res.statusCode} (${ms}ms)`);
    // В мониторинг: только API-роуты, чтобы не засорять статикой
    if (req.url.startsWith('/api/')) {
      monitoring.pushRequest({
        method: req.method,
        path: req.url.split('?')[0],
        status: res.statusCode,
        ms,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
    }
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Tailwind CDN + Google Fonts whitelisted; inline styles разрешены (Tailwind генерит)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'"
  );
  next();
});

// Простой in-memory rate limiter для /api/*: 60 req / 60s / IP.
// При превышении — 429.
const rateBuckets = new Map();
function rateLimit(maxReq, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { count: 0, reset: now + windowMs };
    if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
    bucket.count++;
    rateBuckets.set(ip, bucket);
    res.setHeader('X-RateLimit-Limit', String(maxReq));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxReq - bucket.count)));
    if (bucket.count > maxReq) {
      const retryAfter = Math.ceil((bucket.reset - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      console.warn(`[RATELIMIT] ${ip} blocked, ${bucket.count}/${maxReq} in window`);
      return res.status(429).json({ error: 'too_many_requests', retry_after: retryAfter });
    }
    next();
  };
}
// Чистка старых корзин раз в 5 мин, чтобы Map не рос бесконечно
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateBuckets) if (now > b.reset + 60000) rateBuckets.delete(ip);
}, 5 * 60 * 1000);

app.use('/api/', rateLimit(120, 60_000));
// Жёстче для /api/auth (защита от brute force)
app.use(['/api/auth/login', '/api/auth/signup', '/api/admin/login'], rateLimit(20, 60_000));

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    indexExists: fs.existsSync(indexHtml),
    srcExists: fs.existsSync(srcDir),
    cwd: process.cwd(),
    dirname: __dirname
  });
});

app.post('/api/auth/login', require('./api/auth/login'));
app.post('/api/auth/signup', require('./api/auth/signup'));
app.post('/api/auth/update-email', require('./api/auth/update-email'));
app.post('/api/auth/update-password', require('./api/auth/update-password'));
app.post('/api/auth/update-name', require('./api/auth/update-name'));
app.get('/api/auth/me', require('./api/auth/me'));

app.post('/api/admin/login', require('./api/admin/login'));
app.get('/api/admin/metrics', require('./api/admin/metrics'));
app.get('/api/admin/users', require('./api/admin/users'));
app.post('/api/admin/broadcast', require('./api/admin/broadcast'));
app.get('/api/admin/errors', require('./api/admin/errors'));
app.get('/api/admin/system', require('./api/admin/system'));

// Эндпоинт сбора клиентских ошибок (без auth, под общим rate-limit)
app.post('/api/errors', require('./api/errors'));

app.get('/api/google/auth', require('./api/google/auth'));
app.get('/api/google/callback', require('./api/google/callback'));
app.get('/api/google/status', require('./api/google/status'));
app.get('/api/google/events', require('./api/google/events'));
app.post('/api/google/sync-task', require('./api/google/sync-task'));
app.delete('/api/google/events/:id', require('./api/google/delete-event'));
app.post('/api/google/disconnect', require('./api/google/disconnect'));

app.get('/api/telegram/status', require('./api/telegram/status'));
app.post('/api/telegram/connect', require('./api/telegram/connect'));
app.post('/api/telegram/disconnect', require('./api/telegram/disconnect'));
app.post('/api/telegram/settings', require('./api/telegram/settings'));
app.post('/api/telegram/test', require('./api/telegram/test'));
// Webhook от Telegram (без rate-limit'а, но с проверкой secret_token внутри)
app.post('/api/telegram/webhook', require('./api/telegram/webhook'));

app.post('/api/team/invite', require('./api/team/invite'));
const teamMembersHandler = require('./api/team/members');
app.get('/api/team/members', teamMembersHandler);
app.patch('/api/team/members/:id', teamMembersHandler);
app.delete('/api/team/members/:id', teamMembersHandler);
app.get('/api/team/workspaces', require('./api/team/workspaces'));

const tasksHandler = require('./api/tasks');
app.all('/api/tasks', tasksHandler);
app.all('/api/tasks/:id', tasksHandler);

app.use(express.static(srcDir, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    console.log('[STATIC] serving', filePath);
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.get('*', (req, res) => {
  console.log('[FALLBACK] ->', req.url, 'sending index.html from', indexHtml);
  if (!fs.existsSync(indexHtml)) {
    console.error('[FALLBACK] index.html NOT FOUND at', indexHtml);
    return res.status(404).send(`index.html not found at ${indexHtml}`);
  }
  res.sendFile(indexHtml, (err) => {
    if (err) console.error('[FALLBACK] sendFile error:', err.message);
  });
});

app.use((err, req, res, next) => {
  console.error('[ERR]', req.method, req.url, '->', err.stack || err.message);
  monitoring.pushError({
    kind: 'server',
    message: err.message || 'unknown',
    stack: err.stack,
    url: req.url,
    ua: req.headers['user-agent'],
  });
  if (!res.headersSent) res.status(500).send('Internal Server Error');
});

process.on('uncaughtException', (e) => {
  console.error('[UNCAUGHT]', e.stack || e);
  monitoring.pushError({ kind: 'uncaught', message: e.message || String(e), stack: e.stack });
});
process.on('unhandledRejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e);
  monitoring.pushError({ kind: 'rejection', message: (e && e.message) || String(e), stack: e && e.stack });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BOOT] PLANEL listening on 0.0.0.0:${PORT}`);
  // Telegram: регистрируем webhook и запускаем планировщик (если бот настроен)
  try {
    require('./api/telegram/register').registerWebhook().catch(e => console.error('[tg] register error:', e.message));
    require('./api/telegram/scheduler').start();
  } catch (e) {
    console.error('[tg] init failed:', e.message);
  }
});
