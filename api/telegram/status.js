const { authUser, configured, getTelegramLink } = require('./_helpers');

module.exports = async function telegramStatus(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const link = await getTelegramLink(user.id);
    return res.json({
      configured: configured(),
      bot_username: process.env.TELEGRAM_BOT_USERNAME || null,
      connected: !!link?.chat_id,
      chat_id: link?.chat_id || null,
      username: link?.username || null,
      linked_at: link?.linked_at || null,
      enabled: link?.enabled !== false,
      morning_time: link?.morning_time || '09:00',
      afternoon_time: link?.afternoon_time || '14:00',
      evening_time: link?.evening_time || '21:00',
    });
  } catch {
    return res.status(500).json({ error: 'internal_error' });
  }
};
