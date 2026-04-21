const { configured, tgApi } = require('./_helpers');

// Вызывается на старте сервера, чтобы Telegram отправлял webhook на наш URL.
// В development можно не настраивать TELEGRAM_WEBHOOK_URL — функция тихо пропустит.
async function registerWebhook() {
  if (!configured()) {
    console.log('[tg/register] TELEGRAM_BOT_TOKEN не задан, skip');
    return;
  }
  const url = process.env.TELEGRAM_WEBHOOK_URL;
  if (!url) {
    console.log('[tg/register] TELEGRAM_WEBHOOK_URL не задан, webhook не регистрируем (бот не получит сообщения)');
    return;
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  try {
    const result = await tgApi('setWebhook', {
      url,
      secret_token: secret || undefined,
      allowed_updates: ['message', 'edited_message']
    });
    console.log('[tg/register] webhook set:', url, '·', result);
    if (process.env.TELEGRAM_BOT_USERNAME) {
      console.log('[tg/register] bot username:', process.env.TELEGRAM_BOT_USERNAME);
    } else {
      console.log('[tg/register] подсказка: задайте TELEGRAM_BOT_USERNAME для удобной генерации deep-link в UI');
    }
  } catch (e) {
    console.error('[tg/register] failed:', e.message);
  }
}

module.exports = { registerWebhook };
