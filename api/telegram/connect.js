const { authUser, configured, getTelegramLink, upsertTelegramLink, generateCode } = require('./_helpers');

module.exports = async function telegramConnect(req, res) {
  try {
    if (!configured()) return res.status(503).json({ error: 'telegram_not_configured' });
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const existing = await getTelegramLink(user.id);
    if (existing?.chat_id) {
      // Уже привязан — возвращаем статус
      return res.json({ already_linked: true, chat_id: existing.chat_id, username: existing.username || null });
    }

    const code = generateCode();
    const exp = Date.now() + 15 * 60 * 1000; // 15 минут на привязку
    await upsertTelegramLink(user.id, { link_code: code, link_code_exp: exp });
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || null;
    return res.json({
      code,
      expires_at: exp,
      deep_link: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
      bot_username: botUsername
    });
  } catch (e) {
    console.error('[tg/connect]', e.message);
    return res.status(500).json({ error: 'internal_error' });
  }
};
