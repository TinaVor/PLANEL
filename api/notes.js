const { adminClient, authUser, isUuid, sanitizeStr } = require('./_userdata-helpers');

const KINDS = ['note', 'card', 'zettel'];

function normTags(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => sanitizeStr(x, 60)).filter(Boolean).slice(0, 32);
}

module.exports = async function notes(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const db = adminClient();
    const id = req.params?.id;
    if (id && !isUuid(id)) return res.status(400).json({ error: 'invalid_id' });

    if (req.method === 'GET') {
      const kind = KINDS.includes(req.query?.kind) ? req.query.kind : null;
      let q = db.from('notes')
        .select('id,kind,title,body,tags,links,color,pinned,meta,created_at,updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(2000);
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ notes: data || [] });
    }

    if (req.method === 'POST') {
      const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'note';
      const title = sanitizeStr(req.body?.title, 200);
      const body = sanitizeStr(req.body?.body, 20000);
      if (!title && !body) return res.status(400).json({ error: 'empty_note' });
      const tags = normTags(req.body?.tags);
      const links = normTags(req.body?.links);
      const color = sanitizeStr(req.body?.color, 32) || null;
      const pinned = !!req.body?.pinned;
      const meta = (req.body?.meta && typeof req.body.meta === 'object') ? req.body.meta : {};

      const { data, error } = await db.from('notes')
        .insert({ user_id: user.id, kind, title, body, tags, links, color, pinned, meta })
        .select('id,kind,title,body,tags,links,color,pinned,meta,created_at,updated_at')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ note: data });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const patch = { updated_at: new Date().toISOString() };
      if ('title' in (req.body || {})) patch.title = sanitizeStr(req.body.title, 200);
      if ('body' in (req.body || {})) patch.body = sanitizeStr(req.body.body, 20000);
      if ('tags' in (req.body || {})) patch.tags = normTags(req.body.tags);
      if ('links' in (req.body || {})) patch.links = normTags(req.body.links);
      if ('color' in (req.body || {})) patch.color = sanitizeStr(req.body.color, 32) || null;
      if ('pinned' in (req.body || {})) patch.pinned = !!req.body.pinned;
      if ('meta' in (req.body || {}) && typeof req.body.meta === 'object') patch.meta = req.body.meta;

      const { data, error } = await db.from('notes')
        .update(patch).eq('id', id).eq('user_id', user.id)
        .select('id,kind,title,body,tags,links,color,pinned,meta,created_at,updated_at')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.json({ note: data });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await db.from('notes').delete().eq('id', id).eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[notes] fatal:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
