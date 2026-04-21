const { configured, sendMessage, supabaseAdmin, findByChatId, findByLinkCode, upsertTelegramLink } = require('./_helpers');

// Защита: Telegram передаёт секрет в заголовке X-Telegram-Bot-Api-Secret-Token,
// если webhook был зарегистрирован с secret_token.
function checkSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true; // не настроено — пропускаем
  const got = req.headers['x-telegram-bot-api-secret-token'];
  return got === expected;
}

async function tasksToday(userId) {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('tasks')
    .select('id,title,done,due_date,priority')
    .eq('user_id', userId)
    .or(`due_date.eq.${today},and(due_date.is.null,done.eq.false)`)
    .order('done', { ascending: true })
    .limit(20);
  return data || [];
}

async function statsToday(userId) {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('tasks')
    .select('done,due_date')
    .eq('user_id', userId)
    .eq('due_date', today);
  const total = (data || []).length;
  const done = (data || []).filter(t => t.done).length;
  return { total, done };
}

async function handleCommand(text, from, chat, link) {
  const cmd = (text || '').trim().split(/\s+/)[0].toLowerCase();
  const arg = (text || '').trim().split(/\s+/)[1] || '';

  // /start <code> — привязка
  if (cmd === '/start' && arg) {
    const candidate = await findByLinkCode(arg.trim());
    if (!candidate) {
      await sendMessage(chat.id, 'Код не найден или уже использован. Возьмите свежий код в профиле PLANEL.');
      return;
    }
    if (candidate.link_code_exp && Date.now() > candidate.link_code_exp) {
      await sendMessage(chat.id, 'Срок действия кода истёк. Возьмите свежий код в профиле PLANEL.');
      return;
    }
    await upsertTelegramLink(candidate.user_id, {
      chat_id: chat.id,
      username: from.username || from.first_name || null,
      linked_at: new Date().toISOString(),
      link_code: null,
      link_code_exp: null,
      enabled: true
    });
    await sendMessage(chat.id, 'Готово. Аккаунт PLANEL привязан. Команды: /today /stats /unlink');
    return;
  }
  if (cmd === '/start') {
    await sendMessage(chat.id, 'Привет. Чтобы привязать аккаунт PLANEL, возьмите 6-значный код в профиле и отправьте: /start КОД');
    return;
  }
  if (!link) {
    await sendMessage(chat.id, 'Я не знаю, к какому аккаунту PLANEL вас привязать. Откройте профиль PLANEL → Telegram → возьмите код, затем отправьте /start КОД.');
    return;
  }
  if (cmd === '/today') {
    const tasks = await tasksToday(link.user_id);
    if (!tasks.length) {
      await sendMessage(chat.id, 'На сегодня задач нет.');
      return;
    }
    const lines = tasks.map((t, i) => {
      const mark = t.done ? '[x]' : '[ ]';
      const prio = t.priority === 'high' ? ' • важно' : t.priority === 'low' ? ' • низкий' : '';
      return `${i + 1}. ${mark} ${escapeHtml(t.title)}${prio}`;
    });
    await sendMessage(chat.id, '<b>Задачи на сегодня:</b>\n' + lines.join('\n'));
    return;
  }
  if (cmd === '/stats') {
    const s = await statsToday(link.user_id);
    await sendMessage(chat.id, `Сегодня: ${s.done}/${s.total} задач выполнено.`);
    return;
  }
  if (cmd === '/unlink') {
    await supabaseAdmin().from('user_telegram').delete().eq('user_id', link.user_id);
    await sendMessage(chat.id, 'Аккаунт отвязан. Чтобы подключить снова — возьмите свежий код в PLANEL.');
    return;
  }
  await sendMessage(chat.id, 'Команды: /today — задачи на сегодня, /stats — прогресс дня, /unlink — отвязать.');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

module.exports = async function telegramWebhook(req, res) {
  // Telegram ожидает 200 OK быстро. Возвращаем сразу, обрабатываем фоном.
  if (!configured()) return res.status(200).json({ ok: true });
  if (!checkSecret(req)) return res.status(403).json({ error: 'forbidden' });

  res.json({ ok: true });

  try {
    const update = req.body || {};
    const msg = update.message || update.edited_message || null;
    if (!msg || !msg.chat || !msg.from) return;

    const link = await findByChatId(msg.chat.id);
    const text = msg.text || '';
    if (text.startsWith('/')) {
      await handleCommand(text, msg.from, msg.chat, link);
    } else if (link) {
      // Свободный текст — пока just acknowledge
      await sendMessage(msg.chat.id, 'Понял. Нужно: /today /stats /unlink');
    }
  } catch (e) {
    console.error('[tg/webhook] processing error:', e.message);
  }
};
