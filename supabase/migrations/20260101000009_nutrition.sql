-- ============================================================
-- OPENPLATE — calorie & macro tracking (run after the agent-guide migration)
--
-- * meals.calories / protein / carbs / fat / fiber: nutrition per serving of
--   a saved meal (kcal and grams). Null = not recorded.
-- * food_log: what was eaten, one row per entry, with the totals for that
--   entry (servings already applied). A saved meal's numbers are copied in
--   when it's logged, so editing the meal later doesn't rewrite history.
-- * nutrition_goals: one row of daily targets (null = no goal).
-- * get_nutrition(token, from, to): goals, day-by-day totals and entries,
--   averages, and every saved meal's per-serving nutrition. For an agent
--   key or a signed-in member.
-- * meals_agent_nutrition(token, action, args): agent writes, write-enabled
--   keys only, logged in meals_agent_actions. Actions: log_food,
--   update_food_log, delete_food_log, set_nutrition_goals, set_meal_nutrition.
--
-- Dates are days in the app's time zone (meals_settings.timezone). Safe to re-run.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

alter table public.meals add column if not exists calories numeric check (calories >= 0);
alter table public.meals add column if not exists protein  numeric check (protein >= 0);
alter table public.meals add column if not exists carbs    numeric check (carbs >= 0);
alter table public.meals add column if not exists fat      numeric check (fat >= 0);
alter table public.meals add column if not exists fiber    numeric check (fiber >= 0);

create table if not exists public.food_log (
  id         uuid primary key default gen_random_uuid(),
  eaten_on   date not null default ((now() at time zone public.meals_tz())::date),
  slot       text not null default 'snack' check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  name       text not null check (btrim(name) <> ''),
  meal_id    uuid references public.meals(id) on delete set null,
  servings   numeric not null default 1 check (servings > 0),
  calories   numeric not null default 0 check (calories >= 0),
  protein    numeric not null default 0 check (protein >= 0),
  carbs      numeric not null default 0 check (carbs >= 0),
  fat        numeric not null default 0 check (fat >= 0),
  fiber      numeric not null default 0 check (fiber >= 0),
  notes      text,
  logged_by  text not null default 'App',
  created_at timestamptz not null default now()
);
create index if not exists food_log_eaten_on_idx on public.food_log (eaten_on, created_at);

create table if not exists public.nutrition_goals (
  id         int primary key default 1 check (id = 1),
  calories   numeric check (calories > 0),
  protein    numeric check (protein > 0),
  carbs      numeric check (carbs > 0),
  fat        numeric check (fat > 0),
  fiber      numeric check (fiber > 0),
  updated_at timestamptz,
  updated_by text
);
insert into public.nutrition_goals (id) values (1) on conflict (id) do nothing;

alter table public.food_log enable row level security;
alter table public.nutrition_goals enable row level security;
drop policy if exists "Members read food_log" on public.food_log;
drop policy if exists "Members insert food_log" on public.food_log;
drop policy if exists "Members update food_log" on public.food_log;
drop policy if exists "Members delete food_log" on public.food_log;
drop policy if exists "Members read nutrition_goals" on public.nutrition_goals;
drop policy if exists "Members update nutrition_goals" on public.nutrition_goals;
create policy "Members read food_log" on public.food_log
  for select to authenticated using ((select public.meals_user_has_access()));
create policy "Members insert food_log" on public.food_log
  for insert to authenticated with check ((select public.meals_user_has_access()));
create policy "Members update food_log" on public.food_log
  for update to authenticated
  using ((select public.meals_user_has_access()))
  with check ((select public.meals_user_has_access()));
create policy "Members delete food_log" on public.food_log
  for delete to authenticated using ((select public.meals_user_has_access()));
create policy "Members read nutrition_goals" on public.nutrition_goals
  for select to authenticated using ((select public.meals_user_has_access()));
create policy "Members update nutrition_goals" on public.nutrition_goals
  for update to authenticated
  using ((select public.meals_user_has_access()))
  with check ((select public.meals_user_has_access()));
revoke all on public.food_log, public.nutrition_goals from anon;

-- ── Helpers ─────────────────────────────────────────────────

-- A nutrient argument: absent → p_default; null → null; else a number in range.
create or replace function public.meals_agent_amount(p_args jsonb, p_key text, p_max numeric, p_default numeric default null)
returns numeric
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_value numeric;
begin
  if not (p_args ? p_key) then
    return p_default;
  end if;
  if jsonb_typeof(p_args -> p_key) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_args -> p_key) <> 'number' then
    raise exception '% must be a number.', p_key using errcode = '22023';
  end if;
  v_value := (p_args ->> p_key)::numeric;
  if v_value < 0 or v_value > p_max then
    raise exception '% must be between 0 and %.', p_key, p_max using errcode = '22023';
  end if;
  return round(v_value, 1);
end;
$$;

-- "2026-10-24", "today" or "yesterday" (app time zone) → date; absent → today.
create or replace function public.meals_agent_day(p_value text)
returns date
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone public.meals_tz())::date;
  v_text text := lower(btrim(coalesce(p_value, '')));
begin
  if v_text in ('', 'today') then
    return v_today;
  elsif v_text = 'yesterday' then
    return v_today - 1;
  end if;
  begin
    return v_text::date;
  exception when others then
    raise exception 'date must look like 2026-10-24 (or "today" / "yesterday").' using errcode = '22023';
  end;
end;
$$;

create or replace function public.meals_agent_slot(p_value text, p_default text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_slot text := lower(btrim(coalesce(p_value, '')));
begin
  if v_slot = '' then
    return p_default;
  end if;
  if v_slot = 'snacks' then
    v_slot := 'snack';
  end if;
  if v_slot not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'meal_slot must be breakfast, lunch, dinner or snack.' using errcode = '22023';
  end if;
  return v_slot;
end;
$$;

create or replace function public.meals_food_log_doc(p_row public.food_log)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'date', p_row.eaten_on,
    'meal_slot', p_row.slot,
    'name', p_row.name,
    'saved_meal', (select name from meals where id = p_row.meal_id),
    'servings', p_row.servings,
    'calories', p_row.calories,
    'protein', p_row.protein,
    'carbs', p_row.carbs,
    'fat', p_row.fat,
    'fiber', p_row.fiber,
    'notes', p_row.notes,
    'logged_by', p_row.logged_by
  )
$$;

create or replace function public.meals_nutrition_goals_doc()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'calories', calories, 'protein', protein, 'carbs', carbs, 'fat', fat, 'fiber', fiber,
    'updated_at', updated_at, 'updated_by', updated_by
  )
  from nutrition_goals where id = 1
$$;

-- Totals for one day, plus what's left of each goal.
create or replace function public.meals_nutrition_day(p_day date)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with t as (
    select
      coalesce(sum(calories), 0) as calories, coalesce(sum(protein), 0) as protein,
      coalesce(sum(carbs), 0) as carbs, coalesce(sum(fat), 0) as fat, coalesce(sum(fiber), 0) as fiber
    from food_log where eaten_on = p_day
  ), g as (select * from nutrition_goals where id = 1)
  select jsonb_build_object(
    'date', p_day,
    'totals', jsonb_build_object('calories', t.calories, 'protein', t.protein, 'carbs', t.carbs, 'fat', t.fat, 'fiber', t.fiber),
    'remaining', jsonb_strip_nulls(jsonb_build_object(
      'calories', g.calories - t.calories, 'protein', g.protein - t.protein,
      'carbs', g.carbs - t.carbs, 'fat', g.fat - t.fat, 'fiber', g.fiber - t.fiber)),
    'entries', coalesce((
      select jsonb_agg(meals_food_log_doc(f) order by array_position(array['breakfast','lunch','dinner','snack'], f.slot), f.created_at)
      from food_log f where f.eaten_on = p_day
    ), '[]'::jsonb)
  )
  from t, g
$$;

-- ── Read ────────────────────────────────────────────────────

create or replace function public.get_nutrition(p_token text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone public.meals_tz())::date;
  v_to date := coalesce(p_to, p_from, v_today);
  v_from date := coalesce(p_from, v_to);
  v_days jsonb;
  v_logged int;
begin
  perform meals_assert_can_read(p_token);
  if v_from > v_to then
    raise exception 'from must be on or before to.' using errcode = '22023';
  end if;
  if v_to - v_from > 92 then
    raise exception 'Ask for at most 93 days at a time.' using errcode = '22023';
  end if;

  select jsonb_agg(meals_nutrition_day(d::date) order by d) into v_days
  from generate_series(v_from, v_to, interval '1 day') d;
  select count(distinct eaten_on) into v_logged from food_log where eaten_on between v_from and v_to;

  return jsonb_build_object(
    'as_of', v_today,
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'days_with_entries', v_logged),
    'goals', meals_nutrition_goals_doc(),
    'days', v_days,
    'daily_average', (
      -- Over the days that have entries, so empty days don't drag it down.
      select jsonb_build_object(
        'calories', round(avg(calories), 0), 'protein', round(avg(protein), 1),
        'carbs', round(avg(carbs), 1), 'fat', round(avg(fat), 1), 'fiber', round(avg(fiber), 1))
      from (
        select sum(calories) calories, sum(protein) protein, sum(carbs) carbs, sum(fat) fat, sum(fiber) fiber
        from food_log where eaten_on between v_from and v_to group by eaten_on
      ) per_day
    ),
    'saved_meals_per_serving', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name,
        'calories', calories, 'protein', protein, 'carbs', carbs, 'fat', fat, 'fiber', fiber
      ) order by name)
      from meals
    ), '[]'::jsonb),
    'notes', jsonb_build_array(
      'Calories are kcal; protein, carbs, fat and fiber are grams.',
      'Entry numbers are totals for that entry (servings already applied). saved_meals_per_serving is per one serving; null = not recorded.',
      'remaining = goal minus eaten; negative means over the goal. Goals that are null are not set.',
      'Dates are days in the app''s time zone (' || public.meals_tz() || ').'
    )
  );
end;
$$;

-- ── Write ───────────────────────────────────────────────────

create or replace function public.meals_agent_nutrition(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_token_id bigint;
  v_label text;
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_result jsonb;
  v_meal meals%rowtype;
  v_meal_id uuid;
  v_row food_log%rowtype;
  v_servings numeric;
  v_ratio numeric;
  v_id uuid;
  v_day date;
begin
  v_token_id := meals_agent_write_token_id(p_token);
  if v_token_id is null then
    raise exception 'This agent key is read-only. Turn on "Can make changes" for it in the app: profile picture → AI Access.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_args) <> 'object' then
    raise exception 'Arguments must be a JSON object.' using errcode = '22023';
  end if;
  select label into v_label from meals_agent_tokens where id = v_token_id;

  case p_action
  when 'log_food' then
    v_servings := coalesce(meals_agent_amount(v_args, 'servings', 50), 1);
    if v_servings <= 0 then
      raise exception 'servings must be more than 0.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(v_args ->> 'meal', '')), '') is not null then
      v_meal_id := meals_agent_resolve('meal', v_args ->> 'meal');
      select * into v_meal from meals where id = v_meal_id;
    end if;
    if v_meal_id is null and nullif(btrim(coalesce(v_args ->> 'name', '')), '') is null then
      raise exception 'Pass name (what was eaten) or meal (a saved meal).' using errcode = '22023';
    end if;
    -- Numbers passed are totals for the entry; otherwise the saved meal's per-serving numbers × servings.
    if v_meal_id is not null and not (v_args ? 'calories') and v_meal.calories is null then
      raise exception 'The meal "%" has no nutrition saved. Pass calories (and macros) for this entry, or save them first with set_meal_nutrition.', v_meal.name using errcode = '22023';
    end if;
    if v_meal_id is null and not (v_args ? 'calories') then
      raise exception 'Pass calories (and protein, carbs, fat, fiber if known) for "%".', btrim(v_args ->> 'name') using errcode = '22023';
    end if;
    insert into food_log (eaten_on, slot, name, meal_id, servings, calories, protein, carbs, fat, fiber, notes, logged_by)
    values (
      meals_agent_day(v_args ->> 'date'),
      meals_agent_slot(v_args ->> 'meal_slot', 'snack'),
      coalesce(nullif(btrim(coalesce(v_args ->> 'name', '')), ''), v_meal.name),
      v_meal_id,
      v_servings,
      coalesce(meals_agent_amount(v_args, 'calories', 20000), round(v_meal.calories * v_servings, 1), 0),
      coalesce(meals_agent_amount(v_args, 'protein', 2000), round(v_meal.protein * v_servings, 1), 0),
      coalesce(meals_agent_amount(v_args, 'carbs', 2000), round(v_meal.carbs * v_servings, 1), 0),
      coalesce(meals_agent_amount(v_args, 'fat', 2000), round(v_meal.fat * v_servings, 1), 0),
      coalesce(meals_agent_amount(v_args, 'fiber', 2000), round(v_meal.fiber * v_servings, 1), 0),
      nullif(btrim(coalesce(v_args ->> 'notes', '')), ''),
      v_label
    )
    returning * into v_row;
    v_result := jsonb_build_object('logged', meals_food_log_doc(v_row), 'day', meals_nutrition_day(v_row.eaten_on) - 'entries');

  when 'update_food_log' then
    begin
      v_id := (v_args ->> 'entry')::uuid;
    exception when others then
      v_id := null;
    end;
    select * into v_row from food_log where id = v_id;
    if v_row.id is null then
      raise exception 'No food log entry with id "%". Ids are in get_nutrition.', coalesce(v_args ->> 'entry', '') using errcode = '22023';
    end if;
    v_day := v_row.eaten_on;
    -- Changing servings alone scales every number; numbers passed win.
    v_ratio := 1;
    if v_args ? 'servings' then
      v_servings := meals_agent_amount(v_args, 'servings', 50);
      if v_servings is null or v_servings <= 0 then
        raise exception 'servings must be more than 0.' using errcode = '22023';
      end if;
      v_ratio := v_servings / v_row.servings;
      v_row.servings := v_servings;
    end if;
    v_row.calories := coalesce(meals_agent_amount(v_args, 'calories', 20000, round(v_row.calories * v_ratio, 1)), 0);
    v_row.protein := coalesce(meals_agent_amount(v_args, 'protein', 2000, round(v_row.protein * v_ratio, 1)), 0);
    v_row.carbs := coalesce(meals_agent_amount(v_args, 'carbs', 2000, round(v_row.carbs * v_ratio, 1)), 0);
    v_row.fat := coalesce(meals_agent_amount(v_args, 'fat', 2000, round(v_row.fat * v_ratio, 1)), 0);
    v_row.fiber := coalesce(meals_agent_amount(v_args, 'fiber', 2000, round(v_row.fiber * v_ratio, 1)), 0);
    if v_args ? 'name' then
      if nullif(btrim(coalesce(v_args ->> 'name', '')), '') is null then
        raise exception 'name can''t be empty.' using errcode = '22023';
      end if;
      v_row.name := btrim(v_args ->> 'name');
    end if;
    if v_args ? 'date' then v_row.eaten_on := meals_agent_day(v_args ->> 'date'); end if;
    if v_args ? 'meal_slot' then v_row.slot := meals_agent_slot(v_args ->> 'meal_slot', v_row.slot); end if;
    if v_args ? 'notes' then v_row.notes := nullif(btrim(coalesce(v_args ->> 'notes', '')), ''); end if;
    update food_log
    set eaten_on = v_row.eaten_on, slot = v_row.slot, name = v_row.name, servings = v_row.servings,
        calories = v_row.calories, protein = v_row.protein, carbs = v_row.carbs, fat = v_row.fat, fiber = v_row.fiber,
        notes = v_row.notes
    where id = v_row.id
    returning * into v_row;
    v_result := jsonb_build_object('updated', meals_food_log_doc(v_row), 'day', meals_nutrition_day(v_row.eaten_on) - 'entries');

  when 'delete_food_log' then
    begin
      v_id := (v_args ->> 'entry')::uuid;
    exception when others then
      v_id := null;
    end;
    delete from food_log where id = v_id returning * into v_row;
    if v_row.id is null then
      raise exception 'No food log entry with id "%". Ids are in get_nutrition.', coalesce(v_args ->> 'entry', '') using errcode = '22023';
    end if;
    v_result := jsonb_build_object('deleted', meals_food_log_doc(v_row), 'day', meals_nutrition_day(v_row.eaten_on) - 'entries');

  when 'set_nutrition_goals' then
    if not (v_args ?| array['calories', 'protein', 'carbs', 'fat', 'fiber']) then
      raise exception 'Pass at least one of calories, protein, carbs, fat, fiber (0 or null removes that goal).' using errcode = '22023';
    end if;
    update nutrition_goals set
      calories = case when v_args ? 'calories' then nullif(meals_agent_amount(v_args, 'calories', 20000), 0) else calories end,
      protein = case when v_args ? 'protein' then nullif(meals_agent_amount(v_args, 'protein', 2000), 0) else protein end,
      carbs = case when v_args ? 'carbs' then nullif(meals_agent_amount(v_args, 'carbs', 2000), 0) else carbs end,
      fat = case when v_args ? 'fat' then nullif(meals_agent_amount(v_args, 'fat', 2000), 0) else fat end,
      fiber = case when v_args ? 'fiber' then nullif(meals_agent_amount(v_args, 'fiber', 2000), 0) else fiber end,
      updated_at = now(),
      updated_by = v_label
    where id = 1;
    v_result := jsonb_build_object('goals', meals_nutrition_goals_doc(), 'today', meals_nutrition_day((now() at time zone public.meals_tz())::date) - 'entries');

  when 'set_meal_nutrition' then
    v_meal_id := meals_agent_resolve('meal', v_args ->> 'meal');
    if not (v_args ?| array['calories', 'protein', 'carbs', 'fat', 'fiber']) then
      raise exception 'Pass at least one of calories, protein, carbs, fat, fiber (per serving; null clears it).' using errcode = '22023';
    end if;
    update meals set
      calories = case when v_args ? 'calories' then meals_agent_amount(v_args, 'calories', 20000) else calories end,
      protein = case when v_args ? 'protein' then meals_agent_amount(v_args, 'protein', 2000) else protein end,
      carbs = case when v_args ? 'carbs' then meals_agent_amount(v_args, 'carbs', 2000) else carbs end,
      fat = case when v_args ? 'fat' then meals_agent_amount(v_args, 'fat', 2000) else fat end,
      fiber = case when v_args ? 'fiber' then meals_agent_amount(v_args, 'fiber', 2000) else fiber end
    where id = v_meal_id
    returning * into v_meal;
    v_result := jsonb_build_object('meal', jsonb_build_object(
      'id', v_meal.id, 'name', v_meal.name,
      'per_serving', jsonb_build_object('calories', v_meal.calories, 'protein', v_meal.protein, 'carbs', v_meal.carbs, 'fat', v_meal.fat, 'fiber', v_meal.fiber)));

  else
    raise exception 'Unknown nutrition action "%".', p_action using errcode = '22023';
  end case;

  insert into meals_agent_actions (token_id, action, args, result)
  values (v_token_id, p_action, v_args, v_result);
  return v_result;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────

revoke all on function public.meals_agent_amount(jsonb, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.meals_agent_day(text) from public, anon, authenticated;
revoke all on function public.meals_agent_slot(text, text) from public, anon, authenticated;
revoke all on function public.meals_food_log_doc(public.food_log) from public, anon, authenticated;
revoke all on function public.meals_nutrition_goals_doc() from public, anon, authenticated;
revoke all on function public.meals_nutrition_day(date) from public, anon, authenticated;

revoke all on function public.get_nutrition(text, date, date) from public;
revoke all on function public.meals_agent_nutrition(text, text, jsonb) from public;
grant execute on function public.get_nutrition(text, date, date) to anon, authenticated, service_role;
grant execute on function public.meals_agent_nutrition(text, text, jsonb) to anon, authenticated, service_role;
