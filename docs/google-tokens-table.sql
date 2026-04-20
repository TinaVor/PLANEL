-- Перенос Google-токенов из user_metadata в отдельную таблицу с RLS.
-- Причина: user_metadata читается клиентом через auth.getUser() —
-- значит refresh_token может утечь через XSS или devtools.
--
-- Эта таблица доступна ТОЛЬКО через service_role (бэкенд PLANEL).
-- Запусти один раз в Supabase Dashboard → SQL Editor → Run.

create table if not exists public.user_google_tokens (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  access_token   text,
  refresh_token  text,
  expires_at     bigint,
  email          text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.user_google_tokens enable row level security;
-- Политик нет → ни anon, ни authenticated не могут читать/писать.
-- service_role обходит RLS, чем и пользуется бэкенд.

-- Когда таблица создана и работает, можно мигрировать существующие токены:
-- update auth.users
-- set raw_user_meta_data = raw_user_meta_data - 'google'
-- where raw_user_meta_data ? 'google';
-- (но сначала перенеси значения вручную или через миграционный скрипт)
