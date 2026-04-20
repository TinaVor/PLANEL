const { createClient } = require('@supabase/supabase-js');
const { resolveMembership } = require('./team/_helpers');

const adminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || token.length > 4096) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

const PRIORITIES = ['low', 'medium', 'high'];
const sanitizeStr = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

module.exports = async function tasks(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const db = adminClient();
    const id = req.params?.id;
    if (id && !isUuid(id)) return res.status(400).json({ error: 'invalid_id' });

    // Определяем целевой workspace.
    const rawOwnerId = (req.query?.owner_id || req.body?.owner_id || '').toString().trim();
    const targetOwnerId = rawOwnerId && isUuid(rawOwnerId) ? rawOwnerId : user.id;

    const membership = await resolveMembership(user, targetOwnerId);
    if (!membership) return res.status(403).json({ error: 'no_access' });

    const role = membership.role; // 'owner' | 'creator' | 'viewer'
    const isWrite = req.method !== 'GET';
    if (isWrite && role === 'viewer') {
      return res.status(403).json({ error: 'forbidden_viewer_cannot_write' });
    }

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('tasks')
        .select('id,title,description,priority,done,due_date,created_at')
        .eq('user_id', targetOwnerId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ tasks: data, role });
    }

    if (req.method === 'POST') {
      const title = sanitizeStr(req.body?.title, 200);
      if (!title) return res.status(400).json({ error: 'title_required' });
      const description = sanitizeStr(req.body?.description, 2000);
      const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'medium';
      const due_date = req.body?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(req.body.due_date) ? req.body.due_date : null;
      const now = new Date().toISOString();

      const { data, error } = await db.from('tasks').insert({
        user_id: targetOwnerId,
        title,
        description,
        priority,
        due_date,
        done: false,
        created_at: now,
        updated_at: now
      }).select('id,title,description,priority,done,due_date,created_at').single();
      if (error) {
        console.error('[tasks POST] insert error:', error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ task: data });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const patch = { updated_at: new Date().toISOString() };
      if ('title' in (req.body || {})) patch.title = sanitizeStr(req.body.title, 200);
      if ('description' in (req.body || {})) patch.description = sanitizeStr(req.body.description, 2000);
      if (PRIORITIES.includes(req.body?.priority)) patch.priority = req.body.priority;
      if ('done' in (req.body || {})) patch.done = !!req.body.done;
      if ('due_date' in (req.body || {})) {
        patch.due_date = req.body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(req.body.due_date) ? req.body.due_date : null;
      }

      const { data, error } = await db
        .from('tasks')
        .update(patch)
        .eq('id', id)
        .eq('user_id', targetOwnerId)
        .select('id,title,description,priority,done,due_date,created_at')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.json({ task: data });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error, count } = await db
        .from('tasks')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', targetOwnerId);
      if (error) return res.status(500).json({ error: error.message });
      if (!count) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[tasks] fatal:', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
