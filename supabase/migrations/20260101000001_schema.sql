-- ============================================================
-- OPENPLATE — Supabase Schema
-- First migration. Apply all files in supabase/migrations in order
-- (`supabase db push`, the Supabase MCP, or psql). See INSTALL.md.
-- ============================================================


-- 0. APP SETTINGS (one row) + the app's time zone
-- ============================================================
-- Every "today" in the database (food log, workouts, supplements, the
-- snapshot's as_of) is a day in this time zone. Change it any time:
--   update meals_settings set timezone = 'Europe/London' where id = 1;
create table if not exists meals_settings (
  id         int primary key default 1 check (id = 1),
  timezone   text not null default 'UTC',
  updated_at timestamptz default now()
);
insert into meals_settings (id) values (1) on conflict (id) do nothing;
alter table meals_settings enable row level security;

create or replace function public.meals_tz()
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select timezone from meals_settings where id = 1), 'UTC')
$$;
grant execute on function public.meals_tz() to anon, authenticated;

-- Refuse time zone names Postgres doesn't know (they'd break every query).
create or replace function public.meals_settings_check_tz()
returns trigger language plpgsql as $$
begin
  perform now() at time zone new.timezone;
  return new;
end $$;
drop trigger if exists meals_settings_check_tz on meals_settings;
create trigger meals_settings_check_tz before insert or update on meals_settings
  for each row execute function public.meals_settings_check_tz();


-- 1. INGREDIENT CATEGORIES (grocery store sections)
-- ============================================================
create table if not exists ingredient_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  icon        text default '🛒',
  sort_order  int  default 99,
  created_at  timestamptz default now()
);

-- Seed with common grocery sections
insert into ingredient_categories (name, icon, sort_order) values
  ('Produce',            '🥦', 1),
  ('Meat & Seafood',     '🥩', 2),
  ('Dairy & Eggs',       '🥛', 3),
  ('Bakery & Bread',     '🍞', 4),
  ('Pantry & Dry Goods', '🫙', 5),
  ('Spices & Herbs',     '🧂', 6),
  ('Canned & Jarred',    '🥫', 7),
  ('Oils & Vinegars',    '🫒', 8),
  ('Frozen Foods',       '🧊', 9),
  ('Condiments',         '🧴', 10),
  ('Beverages',          '🧃', 11),
  ('Other',              '🛒', 12)
on conflict (name) do nothing;


-- 2. INGREDIENTS (master list)
-- ============================================================
create table if not exists ingredients (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  ingredient_category_id uuid references ingredient_categories(id) on delete set null,
  created_at             timestamptz default now()
);


-- 3. MEAL CATEGORIES
-- ============================================================
create table if not exists meal_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text default '#10b981',
  created_at timestamptz default now()
);

-- Seed with common meal types
insert into meal_categories (name, color) values
  ('Breakfast',       '#f59e0b'),
  ('Lunch',           '#3b82f6'),
  ('Dinner',          '#8b5cf6'),
  ('Quick Meal',      '#10b981'),
  ('Comfort Food',    '#ef4444'),
  ('Healthy',         '#22c55e'),
  ('Grilled',         '#f97316'),
  ('Rice & Grains',   '#eab308'),
  ('Pasta & Noodles', '#a78bfa'),
  ('Soups & Stews',   '#06b6d4'),
  ('Salads',          '#84cc16'),
  ('Snack',           '#ec4899')
on conflict (name) do nothing;


-- 4. MEALS
-- ============================================================
create table if not exists meals (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  meal_category_id   uuid references meal_categories(id) on delete set null,
  prep_time_minutes  int,
  created_at         timestamptz default now()
);


-- 5. MEAL INGREDIENTS (many-to-many join)
-- ============================================================
create table if not exists meal_ingredients (
  id            uuid primary key default gen_random_uuid(),
  meal_id       uuid not null references meals(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity      text,     -- e.g. "2 cups", "1 tbsp"
  optional      boolean default false,
  created_at    timestamptz default now(),
  unique(meal_id, ingredient_id)
);


-- 6. PANTRY (what you currently have at home)
-- ============================================================
create table if not exists pantry (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null unique references ingredients(id) on delete cascade,
  in_stock      boolean default true,
  updated_at    timestamptz default now()
);


-- 7. SHOPPING CART
-- ============================================================
create table if not exists shopping_cart (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  meal_id       uuid references meals(id) on delete set null,
  checked       boolean default false,
  added_at      timestamptz default now(),
  unique(ingredient_id, meal_id)
);


-- INDEXES
-- ============================================================
create index if not exists idx_meal_ingredients_meal       on meal_ingredients(meal_id);
create index if not exists idx_meal_ingredients_ingredient on meal_ingredients(ingredient_id);
create index if not exists idx_pantry_ingredient           on pantry(ingredient_id);
create index if not exists idx_cart_ingredient             on shopping_cart(ingredient_id);
create index if not exists idx_meals_category              on meals(meal_category_id);
create index if not exists idx_ingredients_category        on ingredients(ingredient_category_id);
