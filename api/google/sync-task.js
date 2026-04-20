const { authUser, ensureFreshAccess, supabaseAdmin } = require('./_helpers');

function sanitizeStr(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

module.exports = async function googleSyncTask(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const g = await ensureFreshAccess(user);
    if (!g?.access_token) return res.status(400).json({ error: 'not_connected' });

    const taskId = req.body?.task_id;
    if (!taskId) return res.status(400).json({ error: 'task_id_required' });

    const { data: task, error } = await supabaseAdmin()
      .from('tasks')
      .select('id,title,description,due_date,done')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!task) return res.status(404).json({ error: 'task_not_found' });
    if (!task.due_date) return res.status(400).json({ error: 'no_due_date' });

    const summary = sanitizeStr(task.title, 200) || 'Задача PLANEL';
    const description = sanitizeStr(task.description || '', 2000);

    const eventBody = {
      summary,
      description: description + (description ? '\n\n' : '') + `[PLANEL task ${task.id}]`,
      start: { date: task.due_date },
      end:   { date: task.due_date },
      status: task.done ? 'cancelled' : 'confirmed'
    };

    const existingId = task?.google_event_id || null; // на будущее
    const url = existingId
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    const method = existingId ? 'PATCH' : 'POST';

    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${g.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody)
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('[google/sync-task] api error', r.status, text);
      return res.status(502).json({ error: 'google_api_error', status: r.status });
    }
    const j = await r.json();
    return res.json({ ok: true, event: { id: j.id, html_link: j.htmlLink } });
  } catch (e) {
    console.error('[google/sync-task] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
