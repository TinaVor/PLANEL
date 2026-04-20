const { authUser, supabaseAdmin, attachPendingInvites } = require('./_helpers');

// Список workspace'ов, к которым у пользователя есть доступ как сотрудника.
// Собственный workspace (user.id) клиент добавляет сам.
module.exports = async function teamWorkspaces(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    // Привяжем ожидающие приглашения на этого email, если есть.
    await attachPendingInvites(user);

    const db = supabaseAdmin();
    const { data: rows, error } = await db
      .from('team_members')
      .select('id, owner_id, role, accepted_at')
      .eq('member_id', user.id);
    if (error) return res.status(500).json({ error: error.message });

    const ownerIds = [...new Set((rows || []).map(r => r.owner_id))];
    let owners = [];
    if (ownerIds.length) {
      try {
        const { data } = await db.auth.admin.listUsers({ perPage: 200 });
        const byId = Object.fromEntries((data?.users || []).map(u => [u.id, u]));
        owners = ownerIds.map(id => {
          const u = byId[id];
          return u ? {
            id: u.id,
            email: u.email,
            full_name: u.user_metadata?.full_name || ''
          } : { id, email: '', full_name: '' };
        });
      } catch (e) {
        console.error('[team/workspaces] listUsers failed:', e.message);
        owners = ownerIds.map(id => ({ id, email: '', full_name: '' }));
      }
    }

    const workspaces = (rows || []).map(r => {
      const o = owners.find(x => x.id === r.owner_id) || { email: '', full_name: '' };
      return {
        owner_id: r.owner_id,
        owner_email: o.email,
        owner_name: o.full_name,
        role: r.role,
        accepted_at: r.accepted_at
      };
    });

    return res.json({ workspaces });
  } catch (e) {
    console.error('[team/workspaces] error:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
