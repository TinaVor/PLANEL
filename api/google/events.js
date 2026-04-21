const { authUser, ensureFreshAccess } = require('./_helpers');

module.exports = async function googleEvents(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const g = await ensureFreshAccess(user);
    if (!g?.access_token) return res.status(400).json({ error: 'not_connected' });

    const timeMin = req.query.timeMin || new Date(Date.now() - 7 * 86400000).toISOString();
    const timeMax = req.query.timeMax || new Date(Date.now() + 60 * 86400000).toISOString();
    const params = new URLSearchParams({
      timeMin, timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50'
    });

    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${g.access_token}` }
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('[google/events] api error', r.status, text);
      return res.status(502).json({ error: 'google_api_error', status: r.status });
    }
    const j = await r.json();
    const events = (j.items || []).map(e => ({
      id: e.id,
      summary: e.summary || '(без названия)',
      description: e.description || '',
      start: e.start?.dateTime || e.start?.date || null,
      end:   e.end?.dateTime   || e.end?.date   || null,
      all_day: !!e.start?.date,
      html_link: e.htmlLink || null,
      status: e.status,
      updated: e.updated || null,
      created: e.created || null
    }));
    return res.json({ events });
  } catch (e) {
    console.error('[google/events] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
