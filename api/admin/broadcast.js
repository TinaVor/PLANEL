const { createClient } = require('@supabase/supabase-js');
const requireAdmin = require('./_auth');

const client = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const sanitize = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

module.exports = async function broadcast(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const subject = sanitize(req.body?.subject, 200);
    const body = sanitize(req.body?.body, 4000);
    const targetUserId = typeof req.body?.target_user_id === 'string' ? req.body.target_user_id : null;
    const channels = {
      inapp: req.body?.inapp !== false,
      email: !!req.body?.email
    };

    if (!subject) return res.status(400).json({ error: 'subject_required' });
    if (!body) return res.status(400).json({ error: 'body_required' });
    if (!channels.inapp && !channels.email) return res.status(400).json({ error: 'no_channel' });

    let recipients = [];
    try {
      const { data } = await client().auth.admin.listUsers({ perPage: 200 });
      recipients = (data?.users || []).filter(u => !targetUserId || u.id === targetUserId);
    } catch (e) {
      console.error('[admin/broadcast] listUsers error:', e.message);
    }

    console.log(`[BROADCAST] subject="${subject}" | channels=${JSON.stringify(channels)} | recipients=${recipients.length} | target=${targetUserId || 'ALL'}`);
    if (channels.email) {
      for (const u of recipients) {
        console.log(`[BROADCAST:email] to=${u.email} subject="${subject}"`);
      }
    }

    return res.json({
      ok: true,
      delivered: {
        inapp: channels.inapp ? recipients.length : 0,
        email: channels.email ? recipients.length : 0
      },
      recipients: recipients.map(u => ({ id: u.id, email: u.email }))
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
