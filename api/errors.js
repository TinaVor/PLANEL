const { pushError } = require('./_monitoring');

module.exports = function reportError(req, res) {
  try {
    const b = req.body || {};
    pushError({
      kind: b.kind,
      message: b.message,
      source: b.source,
      line: b.line,
      col: b.col,
      stack: b.stack,
      url: b.url,
      ua: req.headers['user-agent'] || b.ua,
      user_id: b.user_id,
      user_email: b.user_email,
      ip: req.ip,
    });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'bad_request' });
  }
};
