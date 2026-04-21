const { configured, supabaseAdmin, sendMessage } = require('./_helpers');

const TZ = 'Europe/Moscow';

function nowInTZ() {
  // Возвращает {date: 'YYYY-MM-DD', hhmm: 'HH:MM'} в зоне TZ
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date());
  const get = (k) => fmt.find(p => p.type === k)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hhmm = `${get('hour')}:${get('minute')}`;
  return { date, hhmm };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

// Сравнение HH:MM как строк работает корректно
function timeReached(scheduledHHMM, currentHHMM) {
  return currentHHMM >= scheduledHHMM;
}

async function morningPayload(userId) {
  const db = supabaseAdmin();
  const today = nowInTZ().date;
  const { data: tasks } = await db
    .from('tasks')
    .select('id,title,priority,due_date,done')
    .eq('user_id', userId)
    .or(`due_date.eq.${today},and(due_date.is.null,done.eq.false)`)
    .order('done', { ascending: true })
    .limit(15);
  if (!tasks?.length) return 'Доброе утро! На сегодня задач нет — отличный день, чтобы зарядить колесо баланса.';
  const lines = tasks.filter(t => !t.done).slice(0, 10).map((t, i) => {
    const prio = t.priority === 'high' ? ' (важно)' : '';
    return `${i + 1}. ${escapeHtml(t.title)}${prio}`;
  });
  return `<b>Доброе утро. Задачи на сегодня:</b>\n${lines.join('\n')}\n\nКоманды: /today /stats`;
}

async function afternoonPayload(userId) {
  const db = supabaseAdmin();
  const today = nowInTZ().date;
  const { data: tasks } = await db
    .from('tasks')
    .select('done,due_date')
    .eq('user_id', userId)
    .eq('due_date', today);
  const total = (tasks || []).length;
  const done = (tasks || []).filter(t => t.done).length;
  return `<b>Время фокуса.</b>\nПрогресс дня: ${done}/${total} задач.\nЗапустите 25-минутный Помодоро, чтобы продвинуть одну важную задачу.`;
}

async function eveningPayload(userId) {
  const db = supabaseAdmin();
  const today = nowInTZ().date;
  const { data: tasks } = await db
    .from('tasks')
    .select('done,due_date,title')
    .eq('user_id', userId)
    .eq('due_date', today);
  const total = (tasks || []).length;
  const done = (tasks || []).filter(t => t.done).length;
  return `<b>Подведём итоги дня.</b>\nЗакрыто: ${done}/${total} задач.\n\nОткройте Дневник → Рефлексия и ответьте на 3 вопроса:\n• Что получилось?\n• Что помешало?\n• Что завтра сделаешь иначе?`;
}

// Один тик: пробегает по всем подключённым и при необходимости шлёт сообщения.
async function tick() {
  if (!configured()) return;
  const db = supabaseAdmin();
  const { date, hhmm } = nowInTZ();

  let users;
  try {
    const { data, error } = await db
      .from('user_telegram')
      .select('*')
      .not('chat_id', 'is', null)
      .eq('enabled', true);
    if (error) throw error;
    users = data || [];
  } catch (e) {
    console.warn('[tg/scheduler] cannot read user_telegram:', e.message);
    return;
  }

  for (const u of users) {
    try {
      // morning
      if (u.morning_time && timeReached(u.morning_time, hhmm) && u.last_morning !== date) {
        const msg = await morningPayload(u.user_id);
        await sendMessage(u.chat_id, msg);
        await db.from('user_telegram').update({ last_morning: date }).eq('user_id', u.user_id);
      }
      // afternoon
      if (u.afternoon_time && timeReached(u.afternoon_time, hhmm) && u.last_afternoon !== date) {
        const msg = await afternoonPayload(u.user_id);
        await sendMessage(u.chat_id, msg);
        await db.from('user_telegram').update({ last_afternoon: date }).eq('user_id', u.user_id);
      }
      // evening
      if (u.evening_time && timeReached(u.evening_time, hhmm) && u.last_evening !== date) {
        const msg = await eveningPayload(u.user_id);
        await sendMessage(u.chat_id, msg);
        await db.from('user_telegram').update({ last_evening: date }).eq('user_id', u.user_id);
      }
    } catch (e) {
      console.error('[tg/scheduler] user', u.user_id, 'error:', e.message);
    }
  }
}

let timer = null;
function start(intervalMs = 60_000) {
  if (timer) return;
  console.log('[tg/scheduler] start, every', intervalMs / 1000, 'sec, TZ=', TZ);
  // первый tick через 5 сек, чтобы дать серверу подняться
  setTimeout(tick, 5000);
  timer = setInterval(tick, intervalMs);
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { start, stop, tick, _internal: { nowInTZ, timeReached } };
