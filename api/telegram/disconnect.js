const { authUser, getTelegramLink, clearTelegramLink, sendMessage } = require('./_helpers');

module.exports = async function telegramDisconnect(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const link = await getTelegramLink(user.id);
    if (link?.chat_id) {
      try { await sendMessage(link.chat_id, 'PLANEL: аккаунт отвязан. Чтобы подключить снова — заново возьмите код в профиле.'); } catch {}
    }
    await clearTelegramLink(user.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[tg/disconnect]', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
