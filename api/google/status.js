const { authUser, configured } = require('./_helpers');

module.exports = async function googleStatus(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const g = await require('./_helpers').loadGoogleTokens(user);
    return res.json({
      configured: configured(),
      connected: !!(g && g.refresh_token),
      email: g?.email || null,
      connected_at: g?.connected_at || null
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
