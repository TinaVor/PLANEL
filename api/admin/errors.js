const requireAdmin = require('./_auth');
const { getErrorsFromDb } = require('../_monitoring');

module.exports = async function adminErrors(req, res) {
  if (!requireAdmin(req, res)) return;
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const sinceMin = parseInt(req.query.since_min, 10);
  const sinceMs = sinceMin > 0 ? Date.now() - sinceMin * 60_000 : null;
  const result = await getErrorsFromDb({ limit, sinceMs });
  res.json(result);
};
