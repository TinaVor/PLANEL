const { createClient } = require('@supabase/supabase-js');

const adminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const sanitizeName = (v) => {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/\s+/g, ' ').slice(0, 200);
};

async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || token.length > 4096) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = async function updateName(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const name = sanitizeName(req.body?.full_name);
    if (!name || name.length < 2) return res.status(400).json({ error: 'invalid_name' });

    const existing = user.user_metadata || {};
    const { data, error } = await adminClient().auth.admin.updateUserById(user.id, {
      user_metadata: { ...existing, full_name: name }
    });
    if (error) return res.status(400).json({ error: error.message || 'update_failed' });

    return res.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name || name
      }
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
