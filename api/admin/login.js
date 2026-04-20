const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1111';
const ADMIN_TOKEN = 'admin-planel-' + ADMIN_PASSWORD;

module.exports = async function adminLogin(req, res) {
  try {
    const { email, password } = req.body || {};
    if (email !== 'admin@admin' || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    return res.json({
      access_token: ADMIN_TOKEN,
      user: { id: 'admin', email: 'admin@admin', role: 'admin' }
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};

module.exports.ADMIN_TOKEN = ADMIN_TOKEN;
