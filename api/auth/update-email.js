const { createClient } = require('@supabase/supabase-js');

const adminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || token.length > 4096) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = async function updateEmail(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { email } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
    if (email.toLowerCase() === user.email?.toLowerCase()) {
      return res.json({ ok: true, user: { id: user.id, email: user.email } });
    }

    const db = adminClient();
    const { data, error } = await db.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true
    });

    if (error) {
      const msg = error.message || '';
      if (/already|registered|exists/i.test(msg)) {
        return res.status(409).json({ error: 'email_taken' });
      }
      return res.status(400).json({ error: msg });
    }

    return res.json({
      ok: true,
      user: { id: data.user.id, email: data.user.email }
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
