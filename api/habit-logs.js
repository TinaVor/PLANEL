const { adminClient, authUser, isUuid, isISODate } = require('./_userdata-helpers');

// GET   /api/habit-logs                -> [{habit_id, log_date}]
// POST  /api/habit-logs  {habit_id, date} -> toggle (вернёт {done: bool})
// DELETE /api/habit-logs?habit_id=...  -> сносит все логи привычки

module.exports = async function habitLogs(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const db = adminClient();

    if (req.method === 'GET') {
      const { data, error } = await db.from('habit_logs')
        .select('habit_id,log_date')
        .eq('user_id', user.id)
        .limit(20000);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ logs: data || [] });
    }

    if (req.method === 'POST') {
      const habit_id = req.body?.habit_id;
      const date = req.body?.date;
      if (!isUuid(habit_id)) return res.status(400).json({ error: 'invalid_habit_id' });
      if (!isISODate(date)) return res.status(400).json({ error: 'invalid_date' });
      // Проверяем владельца
      const { data: h } = await db.from('habits').select('id').eq('id', habit_id).eq('user_id', user.id).maybeSingle();
      if (!h) return res.status(404).json({ error: 'habit_not_found' });

      const existing = await db.from('habit_logs')
        .select('id').eq('habit_id', habit_id).eq('log_date', date).maybeSingle();
      if (existing.data) {
        await db.from('habit_logs').delete().eq('id', existing.data.id);
        return res.json({ done: false });
      } else {
        const { error } = await db.from('habit_logs')
          .insert({ user_id: user.id, habit_id, log_date: date });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ done: true });
      }
    }

    if (req.method === 'DELETE') {
      const habit_id = req.query?.habit_id;
      if (!isUuid(habit_id)) return res.status(400).json({ error: 'invalid_habit_id' });
      const { error } = await db.from('habit_logs')
        .delete().eq('habit_id', habit_id).eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[habit-logs] fatal:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
