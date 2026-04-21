-- Связка Telegram-аккаунтов пользователей с PLANEL.
-- Хранит chat_id, настройки времени отправки и временные коды привязки.
-- Запусти один раз в Supabase Dashboard → SQL Editor → Run.

create table if not exists public.user_telegram (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  chat_id        bigint,
  username       text,
  linked_at      timestamptz,
  link_code      text,
  link_code_exp  bigint,
  enabled        boolean not null default true,
  morning_time   text default '09:00',    -- HH:MM в таймзоне Europe/Moscow
  afternoon_time text default '14:00',
  evening_time   text default '21:00',
  last_morning   date,
  last_afternoon date,
  last_evening   date,
  updated_at     timestamptz not null default now()
);

-- Быстрый lookup по chat_id (webhook → пользователь)
create index if not exists user_telegram_chat_id_idx on public.user_telegram(chat_id);
-- Lookup по code при /start <code>
create index if not exists user_telegram_link_code_idx on public.user_telegram(link_code);

-- RLS: только service_role имеет доступ
alter table public.user_telegram enable row level security;
