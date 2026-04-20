const { createClient } = require('@supabase/supabase-js');
const requireAdmin = require('./_auth');

const client = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = async function users(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const { data, error } = await client().auth.admin.listUsers({ perPage: 200 });
    if (error) return res.status(500).json({ error: error.message });
    const list = (data?.users || []).map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || '',
      telegram_username: u.user_metadata?.telegram_username || '',
      email_confirmed: !!u.email_confirmed_at,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at
    }));
    return res.json({ users: list });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
