const { createClient } = require('@supabase/supabase-js');

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const isDate  = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const sanitizeName = (v) => {
  if (typeof v !== 'string') return '';
  return v.trim().replace(/\s+/g, ' ').slice(0, 200);
};
const sanitizeTg = (v) => {
  if (typeof v !== 'string') return '';
  const s = v.trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{0,64}$/.test(s)) return null;
  return s;
};

module.exports = async function signup(req, res) {
  try {
    const { email, password, full_name, birth_date, telegram_username } = req.body || {};

    if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'weak_password' });
    }

    const name = sanitizeName(full_name);
    if (!name || name.length < 2) return res.status(400).json({ error: 'invalid_name' });

    if (!isDate(birth_date)) return res.status(400).json({ error: 'invalid_birth_date' });
    const bd = new Date(birth_date);
    const now = new Date();
    if (isNaN(bd.getTime()) || bd > now || bd.getFullYear() < 1900) {
      return res.status(400).json({ error: 'invalid_birth_date' });
    }

    const tg = sanitizeTg(telegram_username);
    if (tg === null) return res.status(400).json({ error: 'invalid_telegram' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          birth_date,
          telegram_username: tg || null
        }
      }
    });

    if (error) {
      const msg = error.message || '';
      if (/already|registered|exists/i.test(msg)) {
        return res.status(409).json({ error: 'email_taken' });
      }
      return res.status(400).json({ error: msg });
    }

    return res.status(201).json({
      needs_confirmation: !data.session,
      user: { id: data.user?.id, email: data.user?.email }
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
