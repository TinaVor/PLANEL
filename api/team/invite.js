const { authUser, supabaseAdmin, findUserByEmail, isEmail, ROLES } = require('./_helpers');

module.exports = async function teamInvite(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    const role = req.body?.role;
    if (!isEmail(rawEmail)) return res.status(400).json({ error: 'invalid_email' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
    if (rawEmail === (user.email || '').toLowerCase()) return res.status(400).json({ error: 'cannot_invite_self' });

    const existing = await findUserByEmail(rawEmail);
    const db = supabaseAdmin();

    const payload = {
      owner_id: user.id,
      member_email: rawEmail,
      member_id: existing?.id || null,
      role,
      invited_at: new Date().toISOString(),
      accepted_at: existing ? new Date().toISOString() : null
    };

    const { data, error } = await db
      .from('team_members')
      .upsert(payload, { onConflict: 'owner_id,member_email', ignoreDuplicates: false })
      .select('id, member_email, member_id, role, invited_at, accepted_at')
      .single();

    if (error) {
      console.error('[team/invite] error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ member: data });
  } catch (e) {
    console.error('[team/invite] fatal:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
