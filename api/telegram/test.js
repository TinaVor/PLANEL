const { authUser, getTelegramLink, sendMessage } = require('./_helpers');

module.exports = async function telegramTest(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const link = await getTelegramLink(user.id);
    if (!link?.chat_id) return res.status(400).json({ error: 'not_linked' });
    await sendMessage(link.chat_id, 'PLANEL: тестовое сообщение получено. Связь работает.');
    return res.json({ ok: true });
  } catch (e) {
    console.error('[tg/test]', e.message);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
};
