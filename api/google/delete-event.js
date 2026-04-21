const { authUser, ensureFreshAccess } = require('./_helpers');

module.exports = async function googleDeleteEvent(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const g = await ensureFreshAccess(user);
    if (!g?.access_token) return res.status(400).json({ error: 'not_connected' });

    const eventId = (req.params?.id || req.body?.event_id || '').trim();
    if (!eventId) return res.status(400).json({ error: 'event_id_required' });

    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${g.access_token}` } }
    );

    // 204 No Content — успех, 404/410 — уже удалено — тоже считаем ок
    if (!r.ok && r.status !== 204 && r.status !== 404 && r.status !== 410) {
      const text = await r.text();
      console.error('[google/delete-event] api error', r.status, text);
      return res.status(502).json({ error: 'google_api_error', status: r.status });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('[google/delete-event] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
