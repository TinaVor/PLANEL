-- Лог ошибок клиента и сервера для админ-мониторинга.
-- Доступ только через service_role (бэкенд PLANEL), RLS включён без политик.
-- Запусти один раз в Supabase Dashboard → SQL Editor → Run. Идемпотентно.

create table if not exists public.error_log (
  id            bigserial primary key,
  ts            timestamptz not null default now(),
  kind          text not null default 'js',
  message       text,
  source        text,
  line          int,
  col           int,
  stack         text,
  url           text,
  ua            text,
  user_id       uuid,
  user_email    text,
  fingerprint   text not null,
  ip            text
);

create index if not exists error_log_ts_idx           on public.error_log (ts desc);
create index if not exists error_log_fingerprint_idx  on public.error_log (fingerprint);
create index if not exists error_log_kind_idx         on public.error_log (kind);

-- RLS: запретить любой доступ от анонимных/авторизованных клиентов.
-- Только service_role (не подчиняется RLS) сможет писать/читать.
alter table public.error_log enable row level security;

-- Авто-чистка старых записей: оставляем 30 дней. Запускай по cron или просто
-- выполняй вручную раз в неделю. Без pg_cron-функции, чтобы не требовать extension.
-- delete from public.error_log where ts < now() - interval '30 days';
