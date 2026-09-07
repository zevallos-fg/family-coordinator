-- v33.0.0 Dragnet backfill migration
-- All additive — no drops, no renames
-- Wrapped in a single transaction

begin;

-- ── Section 1a — recipes columns ───────────────────────────────────────────────
alter table public.recipes
  add column if not exists times_cooked integer not null default 0,
  add column if not exists last_cooked_at date null,
  add column if not exists rotation_status text null check (rotation_status in ('fresh','cooling','stale')),
  add column if not exists cuisine text null,
  add column if not exists notes text null,
  add column if not exists source_image text null;

-- ── Section 1b — ingredients columns ───────────────────────────────────────────
alter table public.ingredients
  add column if not exists usda_fdc_id integer null,
  add column if not exists open_food_facts_barcode text null,
  add column if not exists density_g_per_ml numeric null,
  add column if not exists nutrition_per_100g jsonb null,
  add column if not exists preferred_store_id uuid null references public.stores(id);

-- ── Section 1c — meal_plan_entries columns ──────────────────────────────────────
alter table public.meal_plan_entries
  add column if not exists servings_planned integer null,
  add column if not exists cook_by text null check (cook_by in ('fernando','yenny','both','caregiver')),
  add column if not exists cooked_status text not null default 'planned' check (cooked_status in ('planned','cooked','skipped'));

-- ── Section 1d — grocery_items columns ─────────────────────────────────────────
alter table public.grocery_items
  add column if not exists ingredient_id uuid null references public.ingredients(id),
  add column if not exists qty_value numeric null,
  add column if not exists qty_unit text null,
  add column if not exists dedup_group_id uuid null,
  add column if not exists requires_review boolean not null default false;

create index if not exists idx_grocery_items_ingredient_id on public.grocery_items(ingredient_id) where ingredient_id is not null;
create index if not exists idx_grocery_items_dedup_group on public.grocery_items(dedup_group_id) where dedup_group_id is not null;

-- ── Section 1e — New tables ─────────────────────────────────────────────────────
create table if not exists public.ingredient_form_units (
  ingredient_id uuid not null references public.ingredients(id),
  form_name text not null,
  equiv_qty numeric not null,
  equiv_unit text not null,
  source text not null check (source in ('usda','manual','haiku','receipt')),
  created_at timestamptz not null default now(),
  primary key (ingredient_id, form_name)
);

create table if not exists public.ingredient_resolution_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  raw_input text not null,
  cleaned_name text not null,
  resolved_ingredient_id uuid null references public.ingredients(id),
  descriptors_extracted text[] null,
  confidence text not null check (confidence in ('exact','fuzzy','haiku','unmatched')),
  reviewed_by_user boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ingredient_resolution_log_family on public.ingredient_resolution_log(family_id, created_at desc);
create index if not exists idx_ingredient_resolution_log_unreviewed on public.ingredient_resolution_log(family_id) where reviewed_by_user = false and confidence = 'haiku';

-- ── Section 1f — Stub tables ─────────────────────────────────────────────────────
create table if not exists public.meal_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  date date not null,
  slot text not null check (slot in ('breakfast','lunch','dinner','snack')),
  recipe_id uuid null references public.recipes(id),
  ingredient_id uuid null references public.ingredients(id),
  servings_consumed numeric null,
  user_id uuid null references public.users(id),
  kid_id uuid null references public.kids(id),
  logged_at timestamptz not null default now(),
  check ((user_id is not null) <> (kid_id is not null))
);

create table if not exists public.person_nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  user_id uuid null references public.users(id),
  kid_id uuid null references public.kids(id),
  start_date date not null,
  daily_kcal_target integer null,
  macro_split jsonb null,
  micronutrient_targets jsonb null,
  notes text null,
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (kid_id is not null))
);

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  item text not null,
  cadence_days integer not null,
  last_done_at date null,
  next_due_at date generated always as (case when last_done_at is null then null else last_done_at + cadence_days end) stored,
  notes text null,
  created_at timestamptz not null default now()
);

-- ── Section 1g — Extension + RLS ────────────────────────────────────────────────
create extension if not exists pg_trgm;

alter table public.ingredient_resolution_log enable row level security;
alter table public.meal_log enable row level security;
alter table public.person_nutrition_targets enable row level security;
alter table public.maintenance enable row level security;
alter table public.ingredient_form_units enable row level security;

create policy "ingredient_resolution_log_family_access" on public.ingredient_resolution_log
  for all using (fn_user_in_family(family_id)) with check (fn_user_in_family(family_id));

create policy "meal_log_family_access" on public.meal_log
  for all using (fn_user_in_family(family_id)) with check (fn_user_in_family(family_id));

create policy "person_nutrition_targets_family_access" on public.person_nutrition_targets
  for all using (fn_user_in_family(family_id)) with check (fn_user_in_family(family_id));

create policy "maintenance_family_access" on public.maintenance
  for all using (fn_user_in_family(family_id)) with check (fn_user_in_family(family_id));

create policy "ingredient_form_units_authenticated_read" on public.ingredient_form_units
  for select using (auth.role() = 'authenticated');

commit;
