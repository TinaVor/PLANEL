const { adminClient, authUser, isUuid, isISODate } = require('./_userdata-helpers');

const KINDS = ['food', 'emotion', 'reflection', 'gratitude'];

module.exports = async function diary(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const db = adminClient();
    const id = req.params?.id;
    if (id && !isUuid(id)) return res.status(400).json({ error: 'invalid_id' });

    if (req.method === 'GET') {
      const kind = KINDS.includes(req.query?.kind) ? req.query.kind : null;
      let q = db.from('diary_entries')
        .select('id,kind,entry_date,data,created_at,updated_at')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(5000);
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ entries: data || [] });
    }

    if (req.method === 'POST') {
      const kind = KINDS.includes(req.body?.kind) ? req.body.kind : null;
      if (!kind) return res.status(400).json({ error: 'invalid_kind' });
      const entry_date = isISODate(req.body?.entry_date) ? req.body.entry_date : null;
      const payload = (req.body?.data && typeof req.body.data === 'object') ? req.body.data : {};

      const { data, error } = await db.from('diary_entries')
        .insert({ user_id: user.id, kind, entry_date, data: payload })
        .select('id,kind,entry_date,data,created_at,updated_at')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ entry: data });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const patch = { updated_at: new Date().toISOString() };
      if ('entry_date' in (req.body || {})) {
        patch.entry_date = isISODate(req.body.entry_date) ? req.body.entry_date : null;
      }
      if ('data' in (req.body || {}) && typeof req.body.data === 'object') patch.data = req.body.data;

      const { data, error } = await db.from('diary_entries')
        .update(patch).eq('id', id).eq('user_id', user.id)
        .select('id,kind,entry_date,data,created_at,updated_at')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.json({ entry: data });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await db.from('diary_entries').delete().eq('id', id).eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[diary] fatal:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
