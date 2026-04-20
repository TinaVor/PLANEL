const { createClient } = require('@supabase/supabase-js');

const adminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || token.length > 4096) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = async function updatePassword(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'weak_password' });
    }

    const { error } = await adminClient().auth.admin.updateUserById(user.id, { password });
    if (error) return res.status(400).json({ error: error.message || 'update_failed' });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
