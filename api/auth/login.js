const { createClient } = require('@supabase/supabase-js');

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

module.exports = async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string' || password.length < 1 || password.length > 200) {
      return res.status(400).json({ error: 'invalid_credentials' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    return res.json({
      access_token: data.session.access_token,
      expires_at: data.session.expires_at,
      user: { id: data.user.id, email: data.user.email }
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
