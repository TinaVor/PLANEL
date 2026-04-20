const express = require('express');
const path = require('path');
const fs = require('fs');

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
    console.log(`[RES] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

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

app.get('/api/google/auth', require('./api/google/auth'));
app.get('/api/google/callback', require('./api/google/callback'));
app.get('/api/google/status', require('./api/google/status'));
app.get('/api/google/events', require('./api/google/events'));
app.post('/api/google/sync-task', require('./api/google/sync-task'));
app.post('/api/google/disconnect', require('./api/google/disconnect'));

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
  if (!res.headersSent) res.status(500).send('Internal Server Error');
});

process.on('uncaughtException', (e) => console.error('[UNCAUGHT]', e.stack || e));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED REJECTION]', e));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`[BOOT] PLANEL listening on 0.0.0.0:${PORT}`));
