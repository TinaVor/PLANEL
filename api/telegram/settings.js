const { authUser, getTelegramLink, upsertTelegramLink } = require('./_helpers');

const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

module.exports = async function telegramSettings(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const existing = await getTelegramLink(user.id);
    if (!existing) return res.status(400).json({ error: 'not_linked' });

    const patch = {};
    if (req.body?.enabled !== undefined) patch.enabled = !!req.body.enabled;
    if (isTime(req.body?.morning_time))   patch.morning_time   = req.body.morning_time;
    if (isTime(req.body?.afternoon_time)) patch.afternoon_time = req.body.afternoon_time;
    if (isTime(req.body?.evening_time))   patch.evening_time   = req.body.evening_time;

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'no_changes' });
    const updated = await upsertTelegramLink(user.id, patch);
    return res.json({ ok: true, settings: {
      enabled: updated.enabled,
      morning_time: updated.morning_time,
      afternoon_time: updated.afternoon_time,
      evening_time: updated.evening_time
    }});
  } catch (e) {
    console.error('[tg/settings]', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
