const { adminClient, authUser, isUuid, sanitizeStr } = require('./_userdata-helpers');

const PERIODS = ['day', 'week', 'month'];

module.exports = async function habits(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const db = adminClient();
    const id = req.params?.id;
    if (id && !isUuid(id)) return res.status(400).json({ error: 'invalid_id' });

    if (req.method === 'GET') {
      const { data, error } = await db.from('habits')
        .select('id,name,description,sphere,target_count,target_period,goal_id,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ habits: data || [] });
    }

    if (req.method === 'POST') {
      const name = sanitizeStr(req.body?.name, 200);
      if (!name) return res.status(400).json({ error: 'name_required' });
      const description = sanitizeStr(req.body?.description, 500);
      const sphere = sanitizeStr(req.body?.sphere, 40) || null;
      const target_count = Number.isFinite(+req.body?.target_count) ? Math.max(1, Math.min(99, +req.body.target_count)) : null;
      const target_period = PERIODS.includes(req.body?.target_period) ? req.body.target_period : 'week';
      const goal_id = sanitizeStr(req.body?.goal_id, 80) || null;

      const { data, error } = await db.from('habits')
        .insert({ user_id: user.id, name, description, sphere, target_count, target_period, goal_id })
        .select('id,name,description,sphere,target_count,target_period,goal_id,created_at')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ habit: data });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const patch = { updated_at: new Date().toISOString() };
      if ('name' in (req.body || {})) patch.name = sanitizeStr(req.body.name, 200);
      if ('description' in (req.body || {})) patch.description = sanitizeStr(req.body.description, 500);
      if ('sphere' in (req.body || {})) patch.sphere = sanitizeStr(req.body.sphere, 40) || null;
      if ('target_count' in (req.body || {})) {
        patch.target_count = Number.isFinite(+req.body.target_count) ? Math.max(1, Math.min(99, +req.body.target_count)) : null;
      }
      if (PERIODS.includes(req.body?.target_period)) patch.target_period = req.body.target_period;
      if ('goal_id' in (req.body || {})) patch.goal_id = sanitizeStr(req.body.goal_id, 80) || null;

      const { data, error } = await db.from('habits')
        .update(patch).eq('id', id).eq('user_id', user.id)
        .select('id,name,description,sphere,target_count,target_period,goal_id,created_at')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.json({ habit: data });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await db.from('habits').delete().eq('id', id).eq('user_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[habits] fatal:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
