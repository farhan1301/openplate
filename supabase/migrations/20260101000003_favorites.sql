-- ============================================================
-- OPENPLATE — Favorites (dishes & restaurants)
-- Run this in your Supabase SQL Editor (already applied to the live project)
-- ============================================================

create table if not exists favorites (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('dish', 'restaurant')),
  name        text not null,
  cuisine     text,
  place       text,     -- dishes: where you had it (a restaurant, or "Home")
  location    text,     -- area / address
  rating      int check (rating between 1 and 5),
  notes       text,
  meal_id     uuid references meals(id) on delete set null,  -- dishes you cook yourself
  created_at  timestamptz default now()
);

create index if not exists idx_favorites_kind on favorites(kind);
create index if not exists idx_favorites_meal on favorites(meal_id);

alter table favorites enable row level security;
create policy "Public read favorites"   on favorites for select using (true);
create policy "Public insert favorites" on favorites for insert with check (true);
create policy "Public update favorites" on favorites for update using (true);
create policy "Public delete favorites" on favorites for delete using (true);

-- Custom tags shown on favorite cards (e.g. "South Indian" under Indian)
alter table favorites add column if not exists tags text[] not null default '{}';
