const { configured, getRedirectUri, buildAuthUrl, authUser } = require('./_helpers');

module.exports = async function googleAuth(req, res) {
  try {
    if (!configured()) {
      return res.status(503).json({ error: 'google_not_configured', message: 'Сервер не настроен для Google. Задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.' });
    }
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const redirectUri = getRedirectUri(req);
    // State: Supabase access token (короткоживущий). На callback сервер извлечёт user.
    const h = req.headers.authorization || '';
    const userToken = h.startsWith('Bearer ') ? h.slice(7) : null;
    const state = Buffer.from(JSON.stringify({ t: userToken, n: Math.random().toString(36).slice(2) })).toString('base64url');

    return res.json({ url: buildAuthUrl(redirectUri, state), redirect_uri: redirectUri });
  } catch (e) {
    console.error('[google/auth] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
