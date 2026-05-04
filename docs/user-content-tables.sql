-- Миграция: переносит привычки, заметки и дневник из localStorage в Supabase.
-- Выполни один раз в Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Скрипт идемпотентный.

-- ---------- HABITS ----------
create table if not exists public.habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  description   text,
  sphere        text,
  target_count  int,
  target_period text,
  goal_id       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists habits_user_id_idx on public.habits(user_id);
alter table public.habits enable row level security;

-- ---------- HABIT_LOGS ----------
-- Один день привычки -> одна строка. Отметка/снятие -> insert/delete.
create table if not exists public.habit_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  habit_id  uuid not null references public.habits(id) on delete cascade,
  log_date  date not null,
  created_at timestamptz not null default now()
);
create unique index if not exists habit_logs_unique on public.habit_logs(habit_id, log_date);
create index if not exists habit_logs_user_idx on public.habit_logs(user_id);
alter table public.habit_logs enable row level security;

-- ---------- NOTES ----------
-- Покрывает три режима UI: list ('note'), cards ('card'), zettel ('zettel').
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('note','card','zettel')),
  title       text,
  body        text,
  tags        text[] not null default '{}',
  links       text[] not null default '{}',
  color       text,
  pinned      boolean not null default false,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_user_kind_idx on public.notes(user_id, kind);
alter table public.notes enable row level security;

-- ---------- DIARY ENTRIES ----------
-- Покрывает 4 типа дневников: food / emotion / reflection / gratitude.
create table if not exists public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('food','emotion','reflection','gratitude')),
  entry_date  date,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists diary_user_kind_date_idx on public.diary_entries(user_id, kind, entry_date desc);
alter table public.diary_entries enable row level security;
