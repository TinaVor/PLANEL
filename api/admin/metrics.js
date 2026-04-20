const { createClient } = require('@supabase/supabase-js');
const requireAdmin = require('./_auth');

const client = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = async function metrics(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const db = client();

    let totalUsers = 0;
    let confirmedUsers = 0;
    let recentUsers = 0;
    try {
      const { data: usersData } = await db.auth.admin.listUsers({ perPage: 200 });
      const users = usersData?.users || [];
      totalUsers = users.length;
      confirmedUsers = users.filter(u => u.email_confirmed_at).length;
      const weekAgo = Date.now() - 7 * 86400000;
      recentUsers = users.filter(u => new Date(u.created_at).getTime() > weekAgo).length;
    } catch (e) {
      console.error('[admin/metrics] listUsers error:', e.message);
    }

    let totalTasks = 0;
    let doneTasks = 0;
    try {
      const { count: all } = await db.from('tasks').select('*', { count: 'exact', head: true });
      totalTasks = all || 0;
      const { count: done } = await db.from('tasks').select('*', { count: 'exact', head: true }).eq('done', true);
      doneTasks = done || 0;
    } catch (e) {
      console.error('[admin/metrics] tasks count error:', e.message);
    }

    return res.json({
      users: { total: totalUsers, confirmed: confirmedUsers, last_7_days: recentUsers },
      tasks: { total: totalTasks, done: doneTasks, completion_rate: totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0 },
      generated_at: new Date().toISOString()
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
