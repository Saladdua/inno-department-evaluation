-- ============================================================
-- INNO Department Evaluation — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. USERS
-- Synced from Google Sheets CSV. Do NOT store passwords here —
-- auth is handled by NextAuth using credentials from the sheet.
-- ============================================================
create table if not exists public.users (
  id            uuid primary key default uuid_generate_v4(),
  sheet_row_id  text unique,                      -- row identifier from Google Sheet
  name          text not null,
  email         text unique not null,
  role          text not null check (role in ('super_admin', 'leadership', 'department')),
  password_hash text not null default '',          -- plain-text from Google Sheet CSV (internal tool)
  department_id uuid,                              -- FK added after departments table exists
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- 2. DEPARTMENTS
-- ============================================================
create table if not exists public.departments (
  id         uuid primary key default uuid_generate_v4(),
  name       text unique not null,
  code       text unique,                          -- short code, e.g. "HR", "IT"
  created_at timestamptz default now()
);

-- Add FK from users → departments
alter table public.users
  add constraint users_department_id_fkey
  foreign key (department_id) references public.departments(id) on delete set null;

-- ============================================================
-- 3. EVALUATION PERIODS
-- Stores the quarterly period config shown in "Tiêu chí và hệ số"
-- ============================================================
create table if not exists public.evaluation_periods (
  id          uuid primary key default uuid_generate_v4(),
  quarter     smallint not null check (quarter between 1 and 4),
  year        smallint not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (quarter, year)
);

-- ============================================================
-- 4. CRITERIA
-- Seeded from "DS TIÊU CHÍ & HỆ SỐ" Google Sheet.
-- Leadership/Super Admin can edit weights.
-- ============================================================
create table if not exists public.criteria (
  id             uuid primary key default uuid_generate_v4(),
  period_id      uuid references public.evaluation_periods(id) on delete cascade,
  code           text,                             -- e.g. "TC01"
  name           text not null,
  weight         numeric(5,2) not null default 1,  -- coefficient / hệ số
  input_type     text not null default 'manual' check (input_type in ('manual', 'auto')),
  auto_source    text,                             -- 'google_sheets' | '1office' | 'gitiho'
  auto_config    jsonb,                            -- source-specific config (sheet range, API key ref, etc.)
  display_order  int default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ============================================================
-- 5. EVALUATION MATRIX
-- Stores which department evaluates which.
-- Bidirectional rule enforced at app layer on insert.
-- ============================================================
create table if not exists public.evaluation_matrix (
  id            uuid primary key default uuid_generate_v4(),
  period_id     uuid references public.evaluation_periods(id) on delete cascade,
  evaluator_id  uuid references public.departments(id) on delete cascade,
  target_id     uuid references public.departments(id) on delete cascade,
  selected_by   uuid references public.users(id) on delete set null,  -- who created this pairing
  created_at    timestamptz default now(),
  unique (period_id, evaluator_id, target_id),
  check (evaluator_id <> target_id)
);

-- ============================================================
-- 6. EVALUATIONS
-- One row per (evaluator department × target department × period)
-- ============================================================
create table if not exists public.evaluations (
  id               uuid primary key default uuid_generate_v4(),
  period_id        uuid references public.evaluation_periods(id) on delete cascade,
  evaluator_id     uuid references public.departments(id) on delete cascade,
  target_id        uuid references public.departments(id) on delete cascade,
  submitted_by     uuid references public.users(id) on delete set null,
  status           text not null default 'draft' check (status in ('draft', 'submitted')),
  total_score      numeric(6,2),                   -- computed on submit
  submitted_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (period_id, evaluator_id, target_id)
);

-- ============================================================
-- 7. EVALUATION SCORES
-- Per-criterion score for each evaluation
-- ============================================================
create table if not exists public.evaluation_scores (
  id             uuid primary key default uuid_generate_v4(),
  evaluation_id  uuid references public.evaluations(id) on delete cascade,
  criteria_id    uuid references public.criteria(id) on delete cascade,
  raw_score      numeric(5,2),                     -- 0–10 or source-defined range
  weighted_score numeric(6,2),                     -- raw_score × weight
  note           text,
  auto_fetched   boolean default false,
  fetched_at     timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (evaluation_id, criteria_id)
);

-- ============================================================
-- 8. API INTEGRATIONS
-- Configurable auto-fetch sources per period
-- ============================================================
create table if not exists public.api_integrations (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,                      -- 'google_sheets' | '1office' | 'gitiho'
  display_name text not null,
  config       jsonb not null default '{}',        -- endpoint, sheet_range, auth_method, etc.
  is_active    boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_evaluation_matrix_period  on public.evaluation_matrix(period_id);
create index if not exists idx_evaluation_matrix_evaluator on public.evaluation_matrix(evaluator_id);
create index if not exists idx_evaluations_period        on public.evaluations(period_id);
create index if not exists idx_evaluations_evaluator     on public.evaluations(evaluator_id);
create index if not exists idx_evaluation_scores_eval    on public.evaluation_scores(evaluation_id);
create index if not exists idx_criteria_period           on public.criteria(period_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable per-table — policies added after auth is wired up
-- ============================================================
alter table public.users               enable row level security;
alter table public.departments         enable row level security;
alter table public.evaluation_periods  enable row level security;
alter table public.criteria            enable row level security;
alter table public.evaluation_matrix   enable row level security;
alter table public.evaluations         enable row level security;
alter table public.evaluation_scores   enable row level security;
alter table public.api_integrations    enable row level security;

-- Temporary open policies (replace with role-based policies in Phase 3)
create policy "temp_allow_all_users"              on public.users              for all using (true) with check (true);
create policy "temp_allow_all_departments"        on public.departments        for all using (true) with check (true);
create policy "temp_allow_all_periods"            on public.evaluation_periods for all using (true) with check (true);
create policy "temp_allow_all_criteria"           on public.criteria           for all using (true) with check (true);
create policy "temp_allow_all_matrix"             on public.evaluation_matrix  for all using (true) with check (true);
create policy "temp_allow_all_evaluations"        on public.evaluations        for all using (true) with check (true);
create policy "temp_allow_all_scores"             on public.evaluation_scores  for all using (true) with check (true);
create policy "temp_allow_all_integrations"       on public.api_integrations   for all using (true) with check (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at               before update on public.users               for each row execute function public.set_updated_at();
create trigger set_periods_updated_at             before update on public.evaluation_periods   for each row execute function public.set_updated_at();
create trigger set_criteria_updated_at            before update on public.criteria             for each row execute function public.set_updated_at();
create trigger set_evaluations_updated_at         before update on public.evaluations          for each row execute function public.set_updated_at();
create trigger set_evaluation_scores_updated_at   before update on public.evaluation_scores    for each row execute function public.set_updated_at();
create trigger set_api_integrations_updated_at    before update on public.api_integrations     for each row execute function public.set_updated_at();
