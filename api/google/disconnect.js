const { authUser, revokeToken, clearGoogleTokens } = require('./_helpers');

module.exports = async function googleDisconnect(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const g = user.user_metadata?.google;
    if (g?.refresh_token) await revokeToken(g.refresh_token);
    await clearGoogleTokens(user.id, user.user_metadata);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[google/disconnect] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
