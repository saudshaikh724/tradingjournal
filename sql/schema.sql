-- ============================================================================
-- Trading Journal — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this whole file once in:  Supabase Dashboard → SQL Editor → New query
-- It is idempotent, so re-running it is safe.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLE
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.trading_days (
  id           uuid           primary key default gen_random_uuid(),
  user_id      uuid           not null references auth.users (id) on delete cascade,
  trade_date   date           not null,
  trade_count  integer        not null default 0,
  profit_loss  numeric(12, 2) not null default 0,
  notes        text,
  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now(),

  -- One row per user per calendar day. This is what makes the calendar
  -- "one cell = one entry" and lets the app upsert safely.
  constraint trading_days_user_date_unique unique (user_id, trade_date),

  -- Basic sanity guards, enforced by the database rather than only the UI.
  constraint trading_days_trade_count_nonneg check (trade_count >= 0),
  constraint trading_days_zero_day_is_flat   check (trade_count > 0 or profit_loss = 0)
);

comment on table  public.trading_days             is 'One row per trading day, per user.';
comment on column public.trading_days.profit_loss is 'Net P&L for the day. Negative = losing day.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEXES
--    The unique constraint above already indexes (user_id, trade_date), which
--    covers the app''s "load my days, ordered by date" query.
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists trading_days_user_date_idx
  on public.trading_days (user_id, trade_date desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AUTO-UPDATE updated_at
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trading_days_set_updated_at on public.trading_days;

create trigger trading_days_set_updated_at
  before update on public.trading_days
  for each row
  execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
--    Without these policies every request is denied — this is what stops one
--    user from reading or editing another user''s journal.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.trading_days enable row level security;

drop policy if exists "select own trading days" on public.trading_days;
drop policy if exists "insert own trading days" on public.trading_days;
drop policy if exists "update own trading days" on public.trading_days;
drop policy if exists "delete own trading days" on public.trading_days;

create policy "select own trading days"
  on public.trading_days
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own trading days"
  on public.trading_days
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update own trading days"
  on public.trading_days
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own trading days"
  on public.trading_days
  for delete
  to authenticated
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DEFAULT user_id  (belt and braces)
--    The client always sends user_id explicitly, but this default means a row
--    can never accidentally be inserted without an owner.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.trading_days
  alter column user_id set default auth.uid();


-- ============================================================================
-- OPTIONAL: sample data
-- ----------------------------------------------------------------------------
-- Sign up in the app first, then run the block below while signed in to the
-- SQL editor as yourself is NOT possible (the SQL editor runs as postgres).
-- Instead, replace <YOUR-USER-UUID> with the id from:
--     select id, email from auth.users;
-- ============================================================================

-- insert into public.trading_days (user_id, trade_date, trade_count, profit_loss, notes) values
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 4,  1, -2620.00, 'Overtraded the open.'),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 5,  1,  -777.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 10, 2,   885.00, 'Clean trend day.'),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 12, 2,   470.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 13, 2,  2960.00, 'Best day of the month.'),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 17, 1,  2040.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 18, 1, -1330.00, 'Revenge trade. Stop it.'),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 19, 1, -2500.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 20, 1,  1690.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 21, 2,  1290.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 27, 2,  3200.00, null),
--   ('<YOUR-USER-UUID>', date_trunc('month', now())::date + 28, 5,  -555.00, 'Too many trades.')
-- on conflict (user_id, trade_date) do nothing;
