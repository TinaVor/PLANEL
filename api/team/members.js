const { authUser, supabaseAdmin, isUuid, ROLES } = require('./_helpers');

module.exports = async function teamMembers(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const db = supabaseAdmin();
    const id = req.params?.id;

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('team_members')
        .select('id, member_email, member_id, role, invited_at, accepted_at')
        .eq('owner_id', user.id)
        .order('invited_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ members: data || [] });
    }

    if (!isUuid(id)) return res.status(400).json({ error: 'invalid_id' });

    if (req.method === 'PATCH') {
      const role = req.body?.role;
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
      const { data, error } = await db
        .from('team_members')
        .update({ role })
        .eq('id', id)
        .eq('owner_id', user.id)
        .select('id, member_email, member_id, role, invited_at, accepted_at')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.json({ member: data });
    }

    if (req.method === 'DELETE') {
      const { error, count } = await db
        .from('team_members')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('owner_id', user.id);
      if (error) return res.status(500).json({ error: error.message });
      if (!count) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[team/members] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
