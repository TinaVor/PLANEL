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

module.exports = async function me(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || '',
        telegram_username: user.user_metadata?.telegram_username || '',
        created_at: user.created_at
      }
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
