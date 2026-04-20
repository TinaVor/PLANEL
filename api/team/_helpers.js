const { createClient } = require('@supabase/supabase-js');

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const ROLES = ['viewer', 'creator'];
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const supabaseAdmin = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || token.length > 4096) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Ищет пользователя auth по email (на всей базе). Возвращает {id, email} либо null.
async function findUserByEmail(email) {
  const needle = email.toLowerCase();
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) return null;
  const u = (data?.users || []).find(u => (u.email || '').toLowerCase() === needle);
  return u ? { id: u.id, email: u.email } : null;
}

// Возвращает информацию о членстве current user в workspace ownerId.
// Если ownerId === user.id — user сам себе owner (role='owner').
// Иначе ищет запись в team_members.
async function resolveMembership(user, ownerId) {
  if (!ownerId || ownerId === user.id) {
    return { role: 'owner', owner_id: user.id };
  }
  const db = supabaseAdmin();
  const { data } = await db
    .from('team_members')
    .select('id,role,accepted_at')
    .eq('owner_id', ownerId)
    .eq('member_id', user.id)
    .maybeSingle();
  if (!data) return null;
  return { role: data.role, owner_id: ownerId, membership_id: data.id };
}

// Если пользователя только что пригласили по email, а member_id ещё не проставлен —
// привязываем на первом заходе. Вызываем при логине/me.
async function attachPendingInvites(user) {
  if (!user?.email) return;
  const db = supabaseAdmin();
  const { data } = await db
    .from('team_members')
    .select('id')
    .is('member_id', null)
    .ilike('member_email', user.email);
  if (!data?.length) return;
  await db
    .from('team_members')
    .update({ member_id: user.id, accepted_at: new Date().toISOString() })
    .in('id', data.map(r => r.id));
}

module.exports = {
  isEmail,
  isUuid,
  ROLES,
  supabaseAdmin,
  authUser,
  findUserByEmail,
  resolveMembership,
  attachPendingInvites
};
