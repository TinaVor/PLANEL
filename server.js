const express = require('express');
const path = require('path');

if (require('fs').existsSync(path.join(__dirname, '.env'))) {
  for (const line of require('fs').readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.post('/api/auth/login', require('./api/auth/login'));
app.post('/api/auth/signup', require('./api/auth/signup'));
app.post('/api/auth/update-email', require('./api/auth/update-email'));

const tasksHandler = require('./api/tasks');
app.all('/api/tasks', tasksHandler);
app.all('/api/tasks/:id', tasksHandler);

app.use(express.static(path.join(__dirname, 'src'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PLANEL on :${PORT}`));
