-- Выполни этот скрипт один раз в Supabase Dashboard → SQL Editor → New Query → Run.
-- Скрипт идемпотентный: безопасно запускать повторно.

create table if not exists public.team_members (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  member_email  text not null,
  member_id     uuid references auth.users(id) on delete set null,
  role          text not null check (role in ('viewer','creator')),
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz
);

-- Уникальность приглашения: один email → одному владельцу только один раз.
create unique index if not exists team_members_owner_email_unique
  on public.team_members(owner_id, lower(member_email));

-- Ускоряем lookup "в каких workspace я состою".
create index if not exists team_members_member_id_idx on public.team_members(member_id);

-- RLS включаем, политик не добавляем — сервер ходит service_role, который RLS обходит.
alter table public.team_members enable row level security;
