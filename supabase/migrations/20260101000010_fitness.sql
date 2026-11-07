-- ============================================================
-- OPENPLATE — workouts, gym days, training plan and body weight
-- (run after the nutrition migration)
--
-- * fitness_goals: one row. days_per_week (gym days to hit each Mon–Sun
--   week), gym_days (planned weekdays, e.g. {mon,tue,thu,fri}),
--   session_minutes, weight_unit (kg / lb, for every weight below),
--   target_weight, focus (free text: "lose fat, keep muscle").
-- * workout_routines: the plan. Named sessions ("Push day") with the
--   weekdays they're done on, a focus and their exercises
--   ([{name, sets, reps, weight, duration_minutes, distance_km, notes}]).
-- * workout_log: one row per workout (status done), skipped gym day
--   (skipped) or planned rest day (rest), with what was actually done.
-- * body_log: weight / body fat, one row per day.
-- * get_fitness(token, from, to): goals, plan, calendar (done / missed /
--   rest / planned per day), weekly counts, streaks and body log.
-- * meals_agent_fitness(token, action, args): agent writes (write keys
--   only, logged in meals_agent_actions). Actions: log_workout,
--   update_workout, delete_workout, set_fitness_goals, save_routine,
--   delete_routine, log_body, delete_body_log.
-- * meals_agent_set_about_me(token, content, base_updated_at): agents edit
--   the owner's "About me" profile (write keys only).
-- * get_kitchen_snapshot v3: v2 (renamed meals_kitchen_snapshot_v2) plus
--   nutrition and fitness, so one snapshot covers food, training and body.
--   If you re-run the agent-write migration, re-run this file after it.
--
-- Dates are days in the app's time zone (meals_settings.timezone). Safe to re-run.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table if not exists public.fitness_goals (
  id              int primary key default 1 check (id = 1),
  days_per_week   int check (days_per_week between 1 and 7),
  gym_days        text[] not null default '{}'
                  check (gym_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  session_minutes int check (session_minutes between 1 and 600),
  weight_unit     text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  target_weight   numeric check (target_weight > 0),
  focus           text,
  updated_at      timestamptz,
  updated_by      text
);
insert into public.fitness_goals (id) values (1) on conflict (id) do nothing;

create table if not exists public.workout_routines (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  days       text[] not null default '{}'
             check (days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  focus      text,
  exercises  jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'App'
);
create unique index if not exists workout_routines_name_idx on public.workout_routines (lower(btrim(name)));

create table if not exists public.workout_log (
  id               uuid primary key default gen_random_uuid(),
  done_on          date not null default ((now() at time zone public.meals_tz())::date),
  status           text not null default 'done' check (status in ('done', 'skipped', 'rest')),
  title            text,
  routine_id       uuid references public.workout_routines(id) on delete set null,
  kind             text check (kind in ('strength', 'cardio', 'mobility', 'sport', 'other')),
  duration_minutes int check (duration_minutes between 0 and 1440),
  intensity        text check (intensity in ('easy', 'moderate', 'hard')),
  calories_burned  numeric check (calories_burned >= 0),
  exercises        jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  notes            text,
  logged_by        text not null default 'App',
  created_at       timestamptz not null default now()
);
create index if not exists workout_log_done_on_idx on public.workout_log (done_on, created_at);

create table if not exists public.body_log (
  id          uuid primary key default gen_random_uuid(),
  measured_on date not null unique default ((now() at time zone public.meals_tz())::date),
  weight      numeric check (weight > 0),
  body_fat    numeric check (body_fat > 0 and body_fat < 100),
  notes       text,
  logged_by   text not null default 'App',
  created_at  timestamptz not null default now()
);

alter table public.fitness_goals enable row level security;
alter table public.workout_routines enable row level security;
alter table public.workout_log enable row level security;
alter table public.body_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['workout_routines', 'workout_log', 'body_log'] loop
    execute format('drop policy if exists "Members read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Members insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Members update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Members delete %1$s" on public.%1$I', t);
    execute format('create policy "Members read %1$s" on public.%1$I for select to authenticated using ((select public.meals_user_has_access()))', t);
    execute format('create policy "Members insert %1$s" on public.%1$I for insert to authenticated with check ((select public.meals_user_has_access()))', t);
    execute format('create policy "Members update %1$s" on public.%1$I for update to authenticated using ((select public.meals_user_has_access())) with check ((select public.meals_user_has_access()))', t);
    execute format('create policy "Members delete %1$s" on public.%1$I for delete to authenticated using ((select public.meals_user_has_access()))', t);
  end loop;
end;
$$;
drop policy if exists "Members read fitness_goals" on public.fitness_goals;
drop policy if exists "Members update fitness_goals" on public.fitness_goals;
create policy "Members read fitness_goals" on public.fitness_goals
  for select to authenticated using ((select public.meals_user_has_access()));
create policy "Members update fitness_goals" on public.fitness_goals
  for update to authenticated
  using ((select public.meals_user_has_access()))
  with check ((select public.meals_user_has_access()));
revoke all on public.fitness_goals, public.workout_routines, public.workout_log, public.body_log from anon;

-- ── Helpers ─────────────────────────────────────────────────

create or replace function public.meals_fitness_text(p_args jsonb, p_key text, p_max int default 2000)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_text text := nullif(btrim(coalesce(p_args ->> p_key, '')), '');
begin
  if v_text is not null and length(v_text) > p_max then
    raise exception '% can be at most % characters.', p_key, p_max using errcode = '22023';
  end if;
  return v_text;
end;
$$;

-- An enum-like argument: absent/""/null → null, else one of p_allowed.
create or replace function public.meals_fitness_choice(p_args jsonb, p_key text, p_allowed text[])
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_text text := lower(nullif(btrim(coalesce(p_args ->> p_key, '')), ''));
begin
  if v_text is not null and not (v_text = any(p_allowed)) then
    raise exception '% must be one of: %.', p_key, array_to_string(p_allowed, ', ') using errcode = '22023';
  end if;
  return v_text;
end;
$$;

-- ["Monday", "tue", "Thu"] → {mon,tue,thu}, in week order.
create or replace function public.meals_fitness_days(p_value jsonb)
returns text[]
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_all text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  v_out text[] := '{}';
  v_item text;
  v_day text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return v_out;
  end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'Days must be a list like ["mon", "wed", "fri"].' using errcode = '22023';
  end if;
  for v_item in select jsonb_array_elements_text(p_value) loop
    v_day := left(lower(btrim(v_item)), 3);
    if not (v_day = any(v_all)) then
      raise exception '"%" is not a weekday. Use mon, tue, wed, thu, fri, sat or sun.', v_item using errcode = '22023';
    end if;
    v_out := v_out || v_day;
  end loop;
  return array(select d from unnest(v_all) with ordinality a(d, n) where d = any(v_out) order by n);
end;
$$;

-- Validates a list of exercises and keeps only the known fields.
create or replace function public.meals_fitness_exercises(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_item jsonb;
  v_name text;
  v_sets numeric;
  v_out jsonb := '[]'::jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return v_out;
  end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'exercises must be a list of {name, sets, reps, weight, …}.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_value) > 40 then
    raise exception 'At most 40 exercises at a time.' using errcode = '22023';
  end if;
  for v_item in select jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) = 'string' then
      v_item := jsonb_build_object('name', v_item #>> '{}');
    elsif jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each exercise must be an object like {"name": "Bench press", "sets": 4, "reps": "8"}.' using errcode = '22023';
    end if;
    v_name := meals_fitness_text(v_item, 'name', 120);
    if v_name is null then
      raise exception 'Every exercise needs a name.' using errcode = '22023';
    end if;
    v_sets := meals_agent_amount(v_item, 'sets', 100);
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'sets', round(v_sets)::int,
      'reps', meals_fitness_text(v_item, 'reps', 40),
      'weight', meals_agent_amount(v_item, 'weight', 2000),
      'duration_minutes', meals_agent_amount(v_item, 'duration_minutes', 1440),
      'distance_km', meals_agent_amount(v_item, 'distance_km', 1000),
      'notes', meals_fitness_text(v_item, 'notes', 500)
    )));
  end loop;
  return v_out;
end;
$$;

-- Routine by id, or name (exact, then unique partial match). Null if p_ref is blank.
create or replace function public.meals_fitness_routine(p_ref text, p_required boolean default true)
returns uuid
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_ref text := btrim(coalesce(p_ref, ''));
  v_id uuid;
  v_ids uuid[];
begin
  if v_ref = '' then
    return null;
  end if;
  begin
    v_id := v_ref::uuid;
    if exists (select 1 from workout_routines where id = v_id) then
      return v_id;
    end if;
  exception when others then
    null;
  end;
  select id into v_id from workout_routines where lower(btrim(name)) = lower(v_ref);
  if v_id is not null then
    return v_id;
  end if;
  select array_agg(id) into v_ids from workout_routines where name ilike '%' || meals_agent_like(v_ref) || '%';
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    return v_ids[1];
  end if;
  if not p_required then
    return null;
  end if;
  if coalesce(array_length(v_ids, 1), 0) > 1 then
    raise exception '"%" matches more than one routine: %. Pass the exact name.', v_ref,
      (select string_agg(name, ', ' order by name) from workout_routines where id = any(v_ids)) using errcode = '22023';
  end if;
  raise exception 'No routine called "%". Routines: %.', v_ref,
    coalesce((select string_agg(name, ', ' order by name) from workout_routines), 'none yet (create one with save_routine)') using errcode = '22023';
end;
$$;

create or replace function public.meals_fitness_goals_doc()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'days_per_week', days_per_week, 'gym_days', to_jsonb(gym_days), 'session_minutes', session_minutes,
    'weight_unit', weight_unit, 'target_weight', target_weight, 'focus', focus,
    'updated_at', updated_at, 'updated_by', updated_by
  )
  from fitness_goals where id = 1
$$;

create or replace function public.meals_routine_doc(p_row public.workout_routines)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', p_row.id, 'name', p_row.name, 'days', to_jsonb(p_row.days), 'focus', p_row.focus,
    'exercises', p_row.exercises, 'notes', p_row.notes, 'updated_by', p_row.updated_by
  )
$$;

create or replace function public.meals_workout_doc(p_row public.workout_log)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'date', p_row.done_on,
    'status', p_row.status,
    'title', p_row.title,
    'routine', (select name from workout_routines where id = p_row.routine_id),
    'kind', p_row.kind,
    'duration_minutes', p_row.duration_minutes,
    'intensity', p_row.intensity,
    'calories_burned', p_row.calories_burned,
    'exercises', p_row.exercises,
    'notes', p_row.notes,
    'logged_by', p_row.logged_by
  )
$$;

create or replace function public.meals_body_doc(p_row public.body_log)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', p_row.id, 'date', p_row.measured_on, 'weight', p_row.weight, 'body_fat', p_row.body_fat,
    'notes', p_row.notes, 'logged_by', p_row.logged_by
  )
$$;

-- The calendar mark for one day (same rules as src/lib/fitness.js):
-- done (a workout logged) · missed (logged as skipped, or a planned gym day
-- in the past with nothing logged, counted from the first logged workout) ·
-- rest (logged rest day) · planned (a gym day today or later) · null.
create or replace function public.meals_fitness_day_status(p_day date)
returns text
language sql
stable
set search_path to 'public'
as $$
  with g as (select gym_days from fitness_goals where id = 1),
  l as (
    select bool_or(status = 'done') as done, bool_or(status = 'skipped') as skipped, bool_or(status = 'rest') as rest
    from workout_log where done_on = p_day
  )
  select case
    when l.done then 'done'
    when l.skipped then 'missed'
    when l.rest then 'rest'
    when to_char(p_day, 'dy') = any(g.gym_days) then
      case
        when p_day >= (now() at time zone public.meals_tz())::date then 'planned'
        when p_day >= (select min(done_on) from workout_log where status = 'done') then 'missed'
      end
  end
  from l, g
$$;

-- Distinct days with a workout in the Mon–Sun week starting p_monday.
create or replace function public.meals_fitness_week_count(p_monday date)
returns int
language sql
stable
set search_path to 'public'
as $$
  select count(distinct done_on)::int from workout_log
  where status = 'done' and done_on between p_monday and p_monday + 6
$$;

-- Everything about training for a date range. No access check: callers do it.
create or replace function public.meals_fitness_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone public.meals_tz())::date;
  v_monday date := date_trunc('week', v_today)::date;
  v_goal int;
  v_week date;
  v_streak int := 0;
  v_count int;
  v_this_week int;
  v_unit text;
begin
  select days_per_week, weight_unit into v_goal, v_unit from fitness_goals where id = 1;
  v_this_week := meals_fitness_week_count(v_monday);

  -- Weeks in a row hitting days_per_week: this week counts once it's hit.
  if v_goal is not null then
    if v_this_week >= v_goal then
      v_streak := 1;
    end if;
    v_week := v_monday - 7;
    for i in 1..104 loop
      v_count := meals_fitness_week_count(v_week);
      exit when v_count < v_goal;
      v_streak := v_streak + 1;
      v_week := v_week - 7;
    end loop;
  end if;

  return jsonb_build_object(
    'goals', meals_fitness_goals_doc(),
    'plan', coalesce((
      select jsonb_agg(meals_routine_doc(r) order by
        coalesce((select min(array_position(array['mon','tue','wed','thu','fri','sat','sun'], d)) from unnest(r.days) d), 8), r.name)
      from workout_routines r
    ), '[]'::jsonb),
    'today', jsonb_build_object(
      'date', v_today,
      'weekday', to_char(v_today, 'dy'),
      'status', meals_fitness_day_status(v_today),
      'is_gym_day', to_char(v_today, 'dy') = any(coalesce((select gym_days from fitness_goals where id = 1), '{}')),
      'planned_routines', coalesce((
        select jsonb_agg(name order by name) from workout_routines where to_char(v_today, 'dy') = any(days)
      ), '[]'::jsonb),
      'workouts', coalesce((
        select jsonb_agg(meals_workout_doc(w) order by w.created_at) from workout_log w where w.done_on = v_today
      ), '[]'::jsonb)
    ),
    'this_week', jsonb_build_object(
      'from', v_monday, 'to', v_monday + 6,
      'gym_days_done', v_this_week,
      'goal', v_goal,
      'left', case when v_goal is not null then greatest(v_goal - v_this_week, 0) end,
      'days_left_in_week', v_monday + 6 - v_today
    ),
    'streaks', jsonb_build_object(
      'weeks_hitting_goal', case when v_goal is not null then v_streak end,
      'last_workout', (select max(done_on) from workout_log where status = 'done' and done_on <= v_today),
      'days_since_last_workout', v_today - (select max(done_on) from workout_log where status = 'done' and done_on <= v_today),
      'gym_days_last_30', (select count(distinct done_on) from workout_log where status = 'done' and done_on between v_today - 29 and v_today)
    ),
    'range', jsonb_build_object(
      'from', p_from, 'to', p_to,
      'gym_days_done', (select count(distinct done_on) from workout_log where status = 'done' and done_on between p_from and p_to),
      'missed', (select count(*) from generate_series(p_from, p_to, interval '1 day') d where meals_fitness_day_status(d::date) = 'missed'),
      'minutes', (select coalesce(sum(duration_minutes), 0) from workout_log where status = 'done' and done_on between p_from and p_to),
      'calories_burned', (select coalesce(sum(calories_burned), 0) from workout_log where status = 'done' and done_on between p_from and p_to)
    ),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week_of', w::date, 'gym_days_done', meals_fitness_week_count(w::date), 'goal', v_goal) order by w)
      from generate_series(date_trunc('week', p_from), date_trunc('week', p_to), interval '7 days') w
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d::date,
        'weekday', to_char(d, 'dy'),
        'status', meals_fitness_day_status(d::date),
        'workouts', coalesce((
          select jsonb_agg(meals_workout_doc(w) order by w.created_at) from workout_log w where w.done_on = d::date
        ), '[]'::jsonb)
      ) order by d)
      from generate_series(p_from, p_to, interval '1 day') d
    ), '[]'::jsonb),
    'body', jsonb_build_object(
      'unit', v_unit,
      'latest', (select meals_body_doc(b) from body_log b where weight is not null order by measured_on desc limit 1),
      'target_weight', (select target_weight from fitness_goals where id = 1),
      'entries', coalesce((
        select jsonb_agg(meals_body_doc(b) order by b.measured_on) from body_log b
        where b.measured_on between least(p_from, v_today - 89) and p_to
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- A compact nutrition view for the snapshot: goals, today, the last 7 days.
create or replace function public.meals_nutrition_overview()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with days as (
    select d::date as day from generate_series((now() at time zone public.meals_tz())::date - 6, (now() at time zone public.meals_tz())::date, interval '1 day') d
  )
  select jsonb_build_object(
    'goals', meals_nutrition_goals_doc(),
    'today', meals_nutrition_day((now() at time zone public.meals_tz())::date),
    'last_7_days', (select jsonb_agg(meals_nutrition_day(day) - 'entries' order by day) from days),
    'daily_average_last_7', (
      select jsonb_build_object(
        'days_logged', count(*),
        'calories', round(avg(calories), 0), 'protein', round(avg(protein), 1),
        'carbs', round(avg(carbs), 1), 'fat', round(avg(fat), 1), 'fiber', round(avg(fiber), 1))
      from (
        select sum(calories) calories, sum(protein) protein, sum(carbs) carbs, sum(fat) fat, sum(fiber) fiber
        from food_log, days where eaten_on = day group by eaten_on
      ) per_day
    )
  )
$$;

-- ── Read ────────────────────────────────────────────────────

create or replace function public.get_fitness(p_token text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone public.meals_tz())::date;
  v_to date := coalesce(p_to, v_today);
  v_from date := coalesce(p_from, v_to - 27);
begin
  perform meals_assert_can_read(p_token);
  if v_from > v_to then
    raise exception 'from must be on or before to.' using errcode = '22023';
  end if;
  if v_to - v_from > 185 then
    raise exception 'Ask for at most 186 days at a time.' using errcode = '22023';
  end if;
  return jsonb_build_object('as_of', v_today) || meals_fitness_overview(v_from, v_to) || jsonb_build_object(
    'notes', jsonb_build_array(
      'Calendar status per day: done (worked out), missed (skipped, or a planned gym day that passed with nothing logged, counted from the first logged workout), rest (planned rest), planned (a gym day today or later), null (nothing planned).',
      'Gym days are counted as distinct days with a done workout; weeks run Monday to Sunday.',
      'All weights (exercise weight, body weight, target_weight) are in goals.weight_unit.',
      'Dates are days in the app''s time zone (' || public.meals_tz() || ').'
    )
  );
end;
$$;

-- ── Write ───────────────────────────────────────────────────

create or replace function public.meals_agent_fitness(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
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
  v_today date := (now() at time zone public.meals_tz())::date;
  v_result jsonb;
  v_row workout_log%rowtype;
  v_routine workout_routines%rowtype;
  v_routine_id uuid;
  v_body body_log%rowtype;
  v_id uuid;
  v_day date;
  v_name text;
  v_status text;
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
  when 'log_workout' then
    v_status := coalesce(meals_fitness_choice(v_args, 'status', array['done', 'skipped', 'rest']), 'done');
    v_routine_id := meals_fitness_routine(v_args ->> 'routine');
    if v_routine_id is not null then
      select * into v_routine from workout_routines where id = v_routine_id;
    end if;
    v_name := coalesce(meals_fitness_text(v_args, 'title', 120), v_routine.name,
      case v_status when 'skipped' then 'Skipped' when 'rest' then 'Rest day' end);
    if v_name is null then
      raise exception 'Pass title (e.g. "Leg day", "5 km run") or routine (a saved routine).' using errcode = '22023';
    end if;
    insert into workout_log (done_on, status, title, routine_id, kind, duration_minutes, intensity, calories_burned, exercises, notes, logged_by)
    values (
      meals_agent_day(v_args ->> 'date'),
      v_status,
      v_name,
      v_routine_id,
      coalesce(meals_fitness_choice(v_args, 'kind', array['strength', 'cardio', 'mobility', 'sport', 'other']), case when v_status = 'done' and v_routine_id is not null then 'strength' end),
      round(meals_agent_amount(v_args, 'duration_minutes', 1440))::int,
      meals_fitness_choice(v_args, 'intensity', array['easy', 'moderate', 'hard']),
      meals_agent_amount(v_args, 'calories_burned', 10000),
      -- A routine's exercises are copied in unless the actual ones are passed.
      case when v_args ? 'exercises' then meals_fitness_exercises(v_args -> 'exercises')
           when v_status = 'done' then coalesce(v_routine.exercises, '[]'::jsonb)
           else '[]'::jsonb end,
      meals_fitness_text(v_args, 'notes'),
      v_label
    )
    returning * into v_row;
    v_result := jsonb_build_object('logged', meals_workout_doc(v_row), 'this_week', meals_fitness_overview(v_row.done_on, v_row.done_on) -> 'this_week');

  when 'update_workout' then
    begin
      v_id := (v_args ->> 'entry')::uuid;
    exception when others then
      v_id := null;
    end;
    select * into v_row from workout_log where id = v_id;
    if v_row.id is null then
      raise exception 'No workout with id "%". Ids are in get_fitness.', coalesce(v_args ->> 'entry', '') using errcode = '22023';
    end if;
    if v_args ? 'date' then v_row.done_on := meals_agent_day(v_args ->> 'date'); end if;
    if v_args ? 'status' then v_row.status := coalesce(meals_fitness_choice(v_args, 'status', array['done', 'skipped', 'rest']), v_row.status); end if;
    if v_args ? 'routine' then v_row.routine_id := meals_fitness_routine(v_args ->> 'routine'); end if;
    if v_args ? 'title' then v_row.title := meals_fitness_text(v_args, 'title', 120); end if;
    if v_args ? 'kind' then v_row.kind := meals_fitness_choice(v_args, 'kind', array['strength', 'cardio', 'mobility', 'sport', 'other']); end if;
    if v_args ? 'duration_minutes' then v_row.duration_minutes := round(meals_agent_amount(v_args, 'duration_minutes', 1440))::int; end if;
    if v_args ? 'intensity' then v_row.intensity := meals_fitness_choice(v_args, 'intensity', array['easy', 'moderate', 'hard']); end if;
    if v_args ? 'calories_burned' then v_row.calories_burned := meals_agent_amount(v_args, 'calories_burned', 10000); end if;
    if v_args ? 'exercises' then v_row.exercises := meals_fitness_exercises(v_args -> 'exercises'); end if;
    if v_args ? 'notes' then v_row.notes := meals_fitness_text(v_args, 'notes'); end if;
    update workout_log
    set done_on = v_row.done_on, status = v_row.status, title = v_row.title, routine_id = v_row.routine_id, kind = v_row.kind,
        duration_minutes = v_row.duration_minutes, intensity = v_row.intensity, calories_burned = v_row.calories_burned,
        exercises = v_row.exercises, notes = v_row.notes
    where id = v_row.id
    returning * into v_row;
    v_result := jsonb_build_object('updated', meals_workout_doc(v_row));

  when 'delete_workout' then
    begin
      v_id := (v_args ->> 'entry')::uuid;
    exception when others then
      v_id := null;
    end;
    delete from workout_log where id = v_id returning * into v_row;
    if v_row.id is null then
      raise exception 'No workout with id "%". Ids are in get_fitness.', coalesce(v_args ->> 'entry', '') using errcode = '22023';
    end if;
    v_result := jsonb_build_object('deleted', meals_workout_doc(v_row));

  when 'set_fitness_goals' then
    if not (v_args ?| array['days_per_week', 'gym_days', 'session_minutes', 'weight_unit', 'target_weight', 'focus']) then
      raise exception 'Pass at least one of days_per_week, gym_days, session_minutes, weight_unit, target_weight, focus.' using errcode = '22023';
    end if;
    update fitness_goals set
      days_per_week = case when v_args ? 'days_per_week' then nullif(round(meals_agent_amount(v_args, 'days_per_week', 7))::int, 0) else days_per_week end,
      gym_days = case when v_args ? 'gym_days' then meals_fitness_days(v_args -> 'gym_days') else gym_days end,
      session_minutes = case when v_args ? 'session_minutes' then nullif(round(meals_agent_amount(v_args, 'session_minutes', 600))::int, 0) else session_minutes end,
      weight_unit = case when v_args ? 'weight_unit' then coalesce(meals_fitness_choice(v_args, 'weight_unit', array['kg', 'lb']), weight_unit) else weight_unit end,
      target_weight = case when v_args ? 'target_weight' then nullif(meals_agent_amount(v_args, 'target_weight', 2000), 0) else target_weight end,
      focus = case when v_args ? 'focus' then meals_fitness_text(v_args, 'focus') else focus end,
      updated_at = now(),
      updated_by = v_label
    where id = 1;
    v_result := jsonb_build_object('goals', meals_fitness_goals_doc());

  when 'save_routine' then
    -- Updates the routine named by `routine` (or exactly by `name`), else creates one.
    if nullif(btrim(coalesce(v_args ->> 'routine', '')), '') is not null then
      v_routine_id := meals_fitness_routine(v_args ->> 'routine');
    else
      select id into v_routine_id from workout_routines where lower(btrim(name)) = lower(btrim(coalesce(v_args ->> 'name', '')));
    end if;
    if v_routine_id is null then
      v_name := meals_fitness_text(v_args, 'name', 120);
      if v_name is null then
        raise exception 'Pass name for a new routine, or routine to change an existing one.' using errcode = '22023';
      end if;
      insert into workout_routines (name, days, focus, exercises, notes, updated_by)
      values (
        v_name,
        meals_fitness_days(v_args -> 'days'),
        meals_fitness_text(v_args, 'focus', 200),
        meals_fitness_exercises(v_args -> 'exercises'),
        meals_fitness_text(v_args, 'notes'),
        v_label
      )
      returning * into v_routine;
      v_result := jsonb_build_object('created', meals_routine_doc(v_routine));
    else
      select * into v_routine from workout_routines where id = v_routine_id;
      if v_args ? 'routine' and v_args ? 'name' then
        v_routine.name := coalesce(meals_fitness_text(v_args, 'name', 120), v_routine.name);
      end if;
      if v_args ? 'days' then v_routine.days := meals_fitness_days(v_args -> 'days'); end if;
      if v_args ? 'focus' then v_routine.focus := meals_fitness_text(v_args, 'focus', 200); end if;
      if v_args ? 'exercises' then v_routine.exercises := meals_fitness_exercises(v_args -> 'exercises'); end if;
      if v_args ? 'notes' then v_routine.notes := meals_fitness_text(v_args, 'notes'); end if;
      update workout_routines
      set name = v_routine.name, days = v_routine.days, focus = v_routine.focus, exercises = v_routine.exercises,
          notes = v_routine.notes, updated_at = now(), updated_by = v_label
      where id = v_routine_id
      returning * into v_routine;
      v_result := jsonb_build_object('updated', meals_routine_doc(v_routine));
    end if;

  when 'delete_routine' then
    v_routine_id := meals_fitness_routine(v_args ->> 'routine');
    if v_routine_id is null then
      raise exception 'Pass routine (name or id).' using errcode = '22023';
    end if;
    delete from workout_routines where id = v_routine_id returning * into v_routine;
    v_result := jsonb_build_object('deleted', meals_routine_doc(v_routine));

  when 'log_body' then
    if not (v_args ?| array['weight', 'body_fat']) then
      raise exception 'Pass weight (in the goals'' weight_unit) and/or body_fat (%%).' using errcode = '22023';
    end if;
    v_day := meals_agent_day(v_args ->> 'date');
    insert into body_log (measured_on, weight, body_fat, notes, logged_by)
    values (
      v_day,
      nullif(meals_agent_amount(v_args, 'weight', 2000), 0),
      nullif(meals_agent_amount(v_args, 'body_fat', 99), 0),
      meals_fitness_text(v_args, 'notes'),
      v_label
    )
    on conflict (measured_on) do update set
      weight = case when v_args ? 'weight' then excluded.weight else body_log.weight end,
      body_fat = case when v_args ? 'body_fat' then excluded.body_fat else body_log.body_fat end,
      notes = case when v_args ? 'notes' then excluded.notes else body_log.notes end,
      logged_by = excluded.logged_by
    returning * into v_body;
    v_result := jsonb_build_object('logged', meals_body_doc(v_body), 'unit', (select weight_unit from fitness_goals where id = 1),
      'target_weight', (select target_weight from fitness_goals where id = 1));

  when 'delete_body_log' then
    v_day := meals_agent_day(v_args ->> 'date');
    delete from body_log where measured_on = v_day returning * into v_body;
    if v_body.id is null then
      raise exception 'Nothing logged for %.', v_day using errcode = '22023';
    end if;
    v_result := jsonb_build_object('deleted', meals_body_doc(v_body));

  else
    raise exception 'Unknown fitness action "%".', p_action using errcode = '22023';
  end case;

  insert into meals_agent_actions (token_id, action, args, result)
  values (v_token_id, p_action, v_args, v_result);
  return v_result;
end;
$$;

-- ── About me: agents can edit the owner's profile ───────────

create or replace function public.meals_agent_set_about_me(p_token text, p_content text, p_base_updated_at timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_token_id bigint;
  v_before text;
  v_before_at timestamptz;
  v_content text := btrim(coalesce(p_content, ''));
  v_result jsonb;
begin
  v_token_id := meals_agent_write_token_id(p_token);
  if v_token_id is null then
    raise exception 'This agent key is read-only. Turn on "Can make changes" for it in the app: profile picture → AI Access.' using errcode = '42501';
  end if;
  if length(v_content) > 20000 then
    raise exception 'About me can be at most 20,000 characters.' using errcode = '22023';
  end if;
  select about_me, updated_at into v_before, v_before_at from meals_profile where id = 1 for update;
  if p_base_updated_at is not null and v_before_at is distinct from p_base_updated_at then
    raise exception 'About me changed since you read it. Read it again (get_kitchen_snapshot) and redo your edit.' using errcode = '22023';
  end if;
  update meals_profile set about_me = v_content, updated_at = now() where id = 1;
  v_result := jsonb_build_object('characters', length(v_content), 'updated_at', (select updated_at from meals_profile where id = 1));
  insert into meals_agent_actions (token_id, action, args, result)
  values (v_token_id, 'update_about_me', jsonb_build_object('previous', v_before), v_result);
  return v_result;
end;
$$;

-- ── Snapshot v3: kitchen + nutrition + fitness ──────────────

do $$
begin
  if to_regprocedure('public.meals_kitchen_snapshot_v2(text)') is null then
    alter function public.get_kitchen_snapshot(text) rename to meals_kitchen_snapshot_v2;
  end if;
end;
$$;

create or replace function public.get_kitchen_snapshot(p_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone public.meals_tz())::date;
  v_base jsonb;
  v_fitness jsonb;
begin
  v_base := meals_kitchen_snapshot_v2(p_token); -- checks the key
  v_fitness := meals_fitness_overview(v_today - 13, v_today);
  return v_base
    || jsonb_build_object(
      'schema_version', 3,
      'about_me_updated_at', (select updated_at from meals_profile where id = 1),
      'nutrition', meals_nutrition_overview(),
      'fitness', (v_fitness - 'days' - 'range' - 'weeks') || jsonb_build_object(
        'last_14_days', (
          select jsonb_agg(jsonb_build_object(
            'date', d -> 'date', 'weekday', d -> 'weekday', 'status', d -> 'status',
            'workouts', (select coalesce(jsonb_agg(jsonb_build_object(
              'title', w -> 'title', 'kind', w -> 'kind', 'duration_minutes', w -> 'duration_minutes',
              'intensity', w -> 'intensity', 'calories_burned', w -> 'calories_burned',
              'exercises', (select coalesce(jsonb_agg(e -> 'name'), '[]'::jsonb) from jsonb_array_elements(w -> 'exercises') e)
            )), '[]'::jsonb) from jsonb_array_elements(d -> 'workouts') w where w ->> 'status' = 'done')
          ))
          from jsonb_array_elements(v_fitness -> 'days') d
        )
      )
    )
    || jsonb_build_object('notes', (v_base -> 'notes') || jsonb_build_array(
      'nutrition: calorie / macro goals, today''s food log with what''s left, and the last 7 days. More with get_nutrition.',
      'fitness: training goals, the workout plan, today, this week vs the gym-day goal, streaks, the last 14 days (done / missed / rest / planned) and body weight. More with get_fitness.',
      'Weights are in fitness.goals.weight_unit.'
    ));
end;
$$;

-- ── Grants ──────────────────────────────────────────────────

revoke all on function public.meals_fitness_text(jsonb, text, int) from public, anon, authenticated;
revoke all on function public.meals_fitness_choice(jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.meals_fitness_days(jsonb) from public, anon, authenticated;
revoke all on function public.meals_fitness_exercises(jsonb) from public, anon, authenticated;
revoke all on function public.meals_fitness_routine(text, boolean) from public, anon, authenticated;
revoke all on function public.meals_fitness_goals_doc() from public, anon, authenticated;
revoke all on function public.meals_routine_doc(public.workout_routines) from public, anon, authenticated;
revoke all on function public.meals_workout_doc(public.workout_log) from public, anon, authenticated;
revoke all on function public.meals_body_doc(public.body_log) from public, anon, authenticated;
revoke all on function public.meals_fitness_day_status(date) from public, anon, authenticated;
revoke all on function public.meals_fitness_week_count(date) from public, anon, authenticated;
revoke all on function public.meals_fitness_overview(date, date) from public, anon, authenticated;
revoke all on function public.meals_nutrition_overview() from public, anon, authenticated;
revoke all on function public.meals_kitchen_snapshot_v2(text) from public, anon, authenticated;

revoke all on function public.get_fitness(text, date, date) from public;
revoke all on function public.meals_agent_fitness(text, text, jsonb) from public;
revoke all on function public.meals_agent_set_about_me(text, text, timestamptz) from public;
revoke all on function public.get_kitchen_snapshot(text) from public;
grant execute on function public.get_fitness(text, date, date) to anon, authenticated, service_role;
grant execute on function public.meals_agent_fitness(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.meals_agent_set_about_me(text, text, timestamptz) to anon, authenticated, service_role;
grant execute on function public.get_kitchen_snapshot(text) to anon, authenticated, service_role;
