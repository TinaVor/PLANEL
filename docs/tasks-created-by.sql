-- Миграция: добавляет колонку created_by в tasks, чтобы отслеживать,
-- кто из команды поставил задачу (полезно в рабочих пространствах
-- с несколькими ролями: owner / creator / viewer).
--
-- Выполни один раз в Supabase Dashboard → SQL Editor → New Query → Run.
-- Скрипт идемпотентный: безопасно запускать повторно.

alter table public.tasks
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists tasks_created_by_idx on public.tasks(created_by);
