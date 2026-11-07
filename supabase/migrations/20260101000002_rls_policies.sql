-- ============================================================
-- OPENPLATE — Enable RLS Policies
-- Run this in Supabase SQL Editor
-- Allows the anon key to read/write all app tables
-- ============================================================

-- meal_categories
alter table meal_categories enable row level security;
drop policy if exists "Public read meal_categories" on meal_categories;
create policy "Public read meal_categories" on meal_categories for select using (true);

-- ingredient_categories
alter table ingredient_categories enable row level security;
drop policy if exists "Public read ingredient_categories" on ingredient_categories;
create policy "Public read ingredient_categories" on ingredient_categories for select using (true);

-- meals
alter table meals enable row level security;
drop policy if exists "Public read meals" on meals;
create policy "Public read meals" on meals for select using (true);
drop policy if exists "Public insert meals" on meals;
create policy "Public insert meals" on meals for insert with check (true);
drop policy if exists "Public update meals" on meals;
create policy "Public update meals" on meals for update using (true);
drop policy if exists "Public delete meals" on meals;
create policy "Public delete meals" on meals for delete using (true);

-- ingredients
alter table ingredients enable row level security;
drop policy if exists "Public read ingredients" on ingredients;
create policy "Public read ingredients" on ingredients for select using (true);
drop policy if exists "Public insert ingredients" on ingredients;
create policy "Public insert ingredients" on ingredients for insert with check (true);
drop policy if exists "Public update ingredients" on ingredients;
create policy "Public update ingredients" on ingredients for update using (true);
drop policy if exists "Public delete ingredients" on ingredients;
create policy "Public delete ingredients" on ingredients for delete using (true);

-- meal_ingredients
alter table meal_ingredients enable row level security;
drop policy if exists "Public read meal_ingredients" on meal_ingredients;
create policy "Public read meal_ingredients" on meal_ingredients for select using (true);
drop policy if exists "Public insert meal_ingredients" on meal_ingredients;
create policy "Public insert meal_ingredients" on meal_ingredients for insert with check (true);
drop policy if exists "Public update meal_ingredients" on meal_ingredients;
create policy "Public update meal_ingredients" on meal_ingredients for update using (true);
drop policy if exists "Public delete meal_ingredients" on meal_ingredients;
create policy "Public delete meal_ingredients" on meal_ingredients for delete using (true);

-- pantry
alter table pantry enable row level security;
drop policy if exists "Public read pantry" on pantry;
create policy "Public read pantry" on pantry for select using (true);
drop policy if exists "Public insert pantry" on pantry;
create policy "Public insert pantry" on pantry for insert with check (true);
drop policy if exists "Public update pantry" on pantry;
create policy "Public update pantry" on pantry for update using (true);
drop policy if exists "Public delete pantry" on pantry;
create policy "Public delete pantry" on pantry for delete using (true);

-- shopping_cart
alter table shopping_cart enable row level security;
drop policy if exists "Public read shopping_cart" on shopping_cart;
create policy "Public read shopping_cart" on shopping_cart for select using (true);
drop policy if exists "Public insert shopping_cart" on shopping_cart;
create policy "Public insert shopping_cart" on shopping_cart for insert with check (true);
drop policy if exists "Public update shopping_cart" on shopping_cart;
create policy "Public update shopping_cart" on shopping_cart for update using (true);
drop policy if exists "Public delete shopping_cart" on shopping_cart;
create policy "Public delete shopping_cart" on shopping_cart for delete using (true);
