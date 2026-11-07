-- ============================================================
-- OPENPLATE — supplements (run after the fitness migration)
--
-- * supplements: what the owner takes (or is trying), one row each: name,
--   dose (free text: "2,000 IU", "1 softgel"), times (when in the day:
--   morning / midday / evening / bedtime; empty = any time), status
--   (taking / trying / paused), purpose (why), notes (how to take it, tips
--   from agents), started_on.
-- * supplement_log: one row per dose taken: a supplement, a day and the
--   time slot it was taken for ('any' for supplements with no set time).
-- * get_supplements(token, from, to): the list, today's schedule with what's
--   been taken, and day-by-day doses taken vs due. For an agent key or a
--   signed-in member.
-- * meals_agent_supplements(token, action, args): agent writes, write-enabled
--   keys only, logged in meals_agent_actions. Actions: save_supplement,
--   delete_supplement, log_supplement.
-- * get_kitchen_snapshot v4: v3 (renamed meals_kitchen_snapshot_v3) plus
--   supplements. If you re-run the fitness migration, re-run this file after it.
--
-- Dates are days in the app's time zone (meals_settings.timezone). Safe to re-run.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table if not exists public.supplements (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  dose       text,
  times      text[] not null default '{}'
             check (times <@ array['morning','midday','evening','bedtime']),
  status     text not null default 'taking' check (status in ('taking', 'trying', 'paused')),
  purpose    text,
  notes      text,
  started_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'App'
);
create unique index if not exists supplements_name_idx on public.supplements (lower(btrim(name)));

create table if not exists public.supplement_log (
  id            uuid primary key default gen_random_uuid(),
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  taken_on      date not null default ((now() at time zone public.meals_tz())::date),
  time          text not null default 'any' check (time in ('morning', 'midday', 'evening', 'bedtime', 'any')),
  logged_by     text not null default 'App',
  created_at    timestamptz not null default now(),
  unique (supplement_id, taken_on, time)
);
create index if not exists supplement_log_taken_on_idx on public.supplement_log (taken_on);

alter table public.supplements enable row level security;
alter table public.supplement_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['supplements', 'supplement_log'] loop
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
revoke all on public.supplements, public.supplement_log from anon;

-- ── Helpers ─────────────────────────────────────────────────

-- "morning", "AM", "before bed", … → morning / midday / evening / bedtime
-- (or 'any' when p_allow_any). Null for blank.
create or replace function public.meals_supplement_time(p_value text, p_allow_any boolean default false)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_text text := lower(regexp_replace(btrim(coalesce(p_value, '')), '[\s_-]+', ' ', 'g'));
begin
  if v_text = '' then
    return null;
  end if;
  if v_text in ('morning', 'am', 'breakfast', 'wake', 'waking', 'on waking', 'with breakfast') then
    return 'morning';
  elsif v_text in ('midday', 'mid day', 'noon', 'lunch', 'afternoon', 'with lunch') then
    return 'midday';
  elsif v_text in ('evening', 'pm', 'dinner', 'with dinner', 'supper') then
    return 'evening';
  elsif v_text in ('bedtime', 'bed', 'night', 'nighttime', 'night time', 'before bed', 'sleep', 'before sleep') then
    return 'bedtime';
  elsif p_allow_any and v_text in ('any', 'anytime', 'any time') then
    return 'any';
  end if;
  raise exception '"%" is not a time of day. Use morning, midday, evening or bedtime%.', p_value,
    case when p_allow_any then ' (or any)' else '' end using errcode = '22023';
end;
$$;

-- ["morning", "before bed"] (or one string) → {morning,bedtime}, in day order. "any" → {}.
create or replace function public.meals_supplement_times(p_value jsonb)
returns text[]
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_all text[] := array['morning','midday','evening','bedtime'];
  v_out text[] := '{}';
  v_item text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return v_out;
  end if;
  if jsonb_typeof(p_value) = 'string' then
    p_value := jsonb_build_array(p_value);
  end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'times must be a list like ["morning", "bedtime"].' using errcode = '22023';
  end if;
  for v_item in select jsonb_array_elements_text(p_value) loop
    v_item := meals_supplement_time(v_item, true);
    if v_item is not null and v_item <> 'any' then
      v_out := v_out || v_item;
    end if;
  end loop;
  return array(select t from unnest(v_all) with ordinality a(t, n) where t = any(v_out) order by n);
end;
$$;

-- Supplement by id, or name (exact, then unique partial match).
create or replace function public.meals_supplement_resolve(p_ref text)
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
    raise exception 'Pass supplement (name or id).' using errcode = '22023';
  end if;
  begin
    v_id := v_ref::uuid;
    if exists (select 1 from supplements where id = v_id) then
      return v_id;
    end if;
  exception when others then
    null;
  end;
  select id into v_id from supplements where lower(btrim(name)) = lower(v_ref);
  if v_id is not null then
    return v_id;
  end if;
  select array_agg(id) into v_ids from supplements where name ilike '%' || meals_agent_like(v_ref) || '%';
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    return v_ids[1];
  end if;
  if coalesce(array_length(v_ids, 1), 0) > 1 then
    raise exception '"%" matches more than one supplement: %. Pass the exact name.', v_ref,
      (select string_agg(name, ', ' order by name) from supplements where id = any(v_ids)) using errcode = '22023';
  end if;
  raise exception 'No supplement called "%". Supplements: %.', v_ref,
    coalesce((select string_agg(name, ', ' order by name) from supplements), 'none yet (add one with save_supplement)') using errcode = '22023';
end;
$$;

-- The time slots a supplement is due in: its times, or {any} with none set.
create or replace function public.meals_supplement_slots(p_times text[])
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case when coalesce(cardinality(p_times), 0) = 0 then array['any'] else p_times end
$$;

create or replace function public.meals_supplement_doc(p_row public.supplements, p_day date)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', p_row.id, 'name', p_row.name, 'dose', p_row.dose, 'times', to_jsonb(p_row.times),
    'status', p_row.status, 'purpose', p_row.purpose, 'notes', p_row.notes, 'started_on', p_row.started_on,
    'taken_today', coalesce((
      select jsonb_agg(l.time order by array_position(array['morning','midday','evening','bedtime','any'], l.time))
      from supplement_log l where l.supplement_id = p_row.id and l.taken_on = p_day
    ), '[]'::jsonb),
    'updated_at', p_row.updated_at, 'updated_by', p_row.updated_by
  )
$$;

-- Doses taken vs due on one day, against the current schedule of supplements being taken or tried.
create or replace function public.meals_supplement_day(p_day date)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with due as (
    select s.id, s.name, slot
    from supplements s, unnest(meals_supplement_slots(s.times)) slot
    where s.status in ('taking', 'trying')
  )
  select jsonb_build_object(
    'date', p_day,
    'due', (select count(*) from due),
    'taken', (select count(*) from due join supplement_log l on l.supplement_id = due.id and l.time = due.slot and l.taken_on = p_day),
    'missed_or_left', coalesce((
      select jsonb_agg(jsonb_build_object('supplement', due.name, 'time', due.slot)
        order by array_position(array['morning','midday','evening','bedtime','any'], due.slot), due.name)
      from due
      where not exists (select 1 from supplement_log l where l.supplement_id = due.id and l.time = due.slot and l.taken_on = p_day)
    ), '[]'::jsonb)
  )
$$;

-- The list, today's schedule and the last 7 days. No access check: callers do it.
create or replace function public.meals_supplements_overview()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with today as (select (now() at time zone public.meals_tz())::date as day)
  select jsonb_build_object(
    'supplements', coalesce((
      select jsonb_agg(meals_supplement_doc(s, today.day)
        order by array_position(array['taking','trying','paused'], s.status),
                 coalesce(array_position(array['morning','midday','evening','bedtime'], s.times[1]), 5), s.name)
      from supplements s
    ), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object('time', slot, 'supplements', items) order by array_position(array['morning','midday','evening','bedtime','any'], slot))
      from (
        select slot, jsonb_agg(jsonb_build_object(
          'name', s.name, 'dose', s.dose, 'status', s.status,
          'taken_today', exists (select 1 from supplement_log l where l.supplement_id = s.id and l.taken_on = today.day and l.time = slot)
        ) order by s.name) as items
        from supplements s, unnest(meals_supplement_slots(s.times)) slot
        where s.status in ('taking', 'trying')
        group by slot
      ) g
    ), '[]'::jsonb),
    'today', meals_supplement_day(today.day),
    'last_7_days', (
      select jsonb_agg(meals_supplement_day(d::date) - 'missed_or_left' order by d)
      from generate_series(today.day - 6, today.day, interval '1 day') d
    )
  )
  from today
$$;

-- ── Read ────────────────────────────────────────────────────

create or replace function public.get_supplements(p_token text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone public.meals_tz())::date;
  v_to date := coalesce(p_to, v_today);
  v_from date := coalesce(p_from, v_to - 13);
begin
  perform meals_assert_can_read(p_token);
  if v_from > v_to then
    raise exception 'from must be on or before to.' using errcode = '22023';
  end if;
  if v_to - v_from > 185 then
    raise exception 'Ask for at most 186 days at a time.' using errcode = '22023';
  end if;
  return jsonb_build_object('as_of', v_today) || meals_supplements_overview() || jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'days', (
      select jsonb_agg(meals_supplement_day(d::date) || jsonb_build_object('log', coalesce((
        select jsonb_agg(jsonb_build_object('supplement', s.name, 'time', l.time, 'logged_by', l.logged_by)
          order by array_position(array['morning','midday','evening','bedtime','any'], l.time), s.name)
        from supplement_log l join supplements s on s.id = l.supplement_id
        where l.taken_on = d::date
      ), '[]'::jsonb)) order by d)
      from generate_series(v_from, v_to, interval '1 day') d
    ),
    'notes', jsonb_build_array(
      'times: when in the day each supplement is taken (morning, midday, evening, bedtime); empty = any time, logged as "any".',
      'status: taking (part of the routine), trying (a new one being tried out), paused (not taking for now; not due).',
      'due / taken / missed_or_left count doses of supplements being taken or tried, against today''s schedule.',
      'Dates are days in the app''s time zone (' || public.meals_tz() || ').'
    )
  );
end;
$$;

-- ── Write ───────────────────────────────────────────────────

create or replace function public.meals_agent_supplements(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
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
  v_row supplements%rowtype;
  v_id uuid;
  v_ids uuid[];
  v_name text;
  v_refs text[];
  v_day date;
  v_time text;
  v_slot text;
  v_slots text[];
  v_taken boolean;
  v_changed jsonb := '[]'::jsonb;
  v_count int;
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
  when 'save_supplement' then
    -- Updates the supplement named by `supplement` (or exactly by `name`), else adds one.
    if nullif(btrim(coalesce(v_args ->> 'supplement', '')), '') is not null then
      v_id := meals_supplement_resolve(v_args ->> 'supplement');
    else
      select id into v_id from supplements where lower(btrim(name)) = lower(btrim(coalesce(v_args ->> 'name', '')));
    end if;
    if v_id is null then
      v_name := meals_fitness_text(v_args, 'name', 120);
      if v_name is null then
        raise exception 'Pass name for a new supplement, or supplement to change an existing one.' using errcode = '22023';
      end if;
      insert into supplements (name, dose, times, status, purpose, notes, started_on, updated_by)
      values (
        v_name,
        meals_fitness_text(v_args, 'dose', 120),
        meals_supplement_times(v_args -> 'times'),
        coalesce(meals_fitness_choice(v_args, 'status', array['taking', 'trying', 'paused']), 'taking'),
        meals_fitness_text(v_args, 'purpose', 500),
        meals_fitness_text(v_args, 'notes', 4000),
        case when nullif(btrim(coalesce(v_args ->> 'started_on', '')), '') is null then null else meals_agent_day(v_args ->> 'started_on') end,
        v_label
      )
      returning * into v_row;
      v_result := jsonb_build_object('created', meals_supplement_doc(v_row, v_today));
    else
      select * into v_row from supplements where id = v_id;
      if v_args ? 'supplement' and v_args ? 'name' then
        v_row.name := coalesce(meals_fitness_text(v_args, 'name', 120), v_row.name);
      end if;
      if v_args ? 'dose' then v_row.dose := meals_fitness_text(v_args, 'dose', 120); end if;
      if v_args ? 'times' then v_row.times := meals_supplement_times(v_args -> 'times'); end if;
      if v_args ? 'status' then v_row.status := coalesce(meals_fitness_choice(v_args, 'status', array['taking', 'trying', 'paused']), v_row.status); end if;
      if v_args ? 'purpose' then v_row.purpose := meals_fitness_text(v_args, 'purpose', 500); end if;
      if v_args ? 'notes' then v_row.notes := meals_fitness_text(v_args, 'notes', 4000); end if;
      if v_args ? 'started_on' then
        v_row.started_on := case when nullif(btrim(coalesce(v_args ->> 'started_on', '')), '') is null then null else meals_agent_day(v_args ->> 'started_on') end;
      end if;
      if exists (select 1 from supplements where lower(btrim(name)) = lower(btrim(v_row.name)) and id <> v_id) then
        raise exception 'Another supplement is already called "%".', v_row.name using errcode = '22023';
      end if;
      update supplements
      set name = v_row.name, dose = v_row.dose, times = v_row.times, status = v_row.status, purpose = v_row.purpose,
          notes = v_row.notes, started_on = v_row.started_on, updated_at = now(), updated_by = v_label
      where id = v_id
      returning * into v_row;
      v_result := jsonb_build_object('updated', meals_supplement_doc(v_row, v_today));
    end if;

  when 'delete_supplement' then
    v_id := meals_supplement_resolve(v_args ->> 'supplement');
    select * into v_row from supplements where id = v_id;
    v_result := jsonb_build_object('deleted', meals_supplement_doc(v_row, v_today));
    delete from supplements where id = v_id;

  when 'log_supplement' then
    -- Ticks (or with taken: false, un-ticks) doses for a day.
    if v_args ? 'taken' and jsonb_typeof(v_args -> 'taken') <> 'boolean' then
      raise exception 'taken must be true or false.' using errcode = '22023';
    end if;
    v_taken := coalesce((v_args ->> 'taken')::boolean, true);
    v_day := meals_agent_day(v_args ->> 'date');
    v_time := meals_supplement_time(v_args ->> 'time', true);
    if jsonb_typeof(v_args -> 'supplements') = 'array' then
      select array_agg(value) into v_refs from jsonb_array_elements_text(v_args -> 'supplements') where btrim(value) <> '';
    elsif jsonb_typeof(v_args -> 'supplements') = 'string' then
      v_refs := array[v_args ->> 'supplements'];
    end if;
    if nullif(btrim(coalesce(v_args ->> 'supplement', '')), '') is not null then
      v_refs := coalesce(v_refs, '{}') || (v_args ->> 'supplement');
    end if;

    if coalesce(cardinality(v_refs), 0) = 0 then
      -- "I took my morning supplements": everything due at that time.
      if v_time is null then
        raise exception 'Pass supplements (names), time (morning, midday, evening, bedtime), or both.' using errcode = '22023';
      end if;
      select array_agg(id order by name) into v_ids from supplements
      where status in ('taking', 'trying') and v_time = any(meals_supplement_slots(times));
      if v_ids is null then
        raise exception 'Nothing is scheduled for %. Pass supplements by name.', v_time using errcode = '22023';
      end if;
    else
      select array_agg(distinct meals_supplement_resolve(r)) into v_ids from unnest(v_refs) r;
    end if;

    foreach v_id in array v_ids loop
      select * into v_row from supplements where id = v_id;
      v_slots := meals_supplement_slots(v_row.times);
      if v_time is not null and v_time = any(v_slots) then
        v_slot := v_time;
      elsif v_taken then
        -- No time, or one off its schedule (taken late): the next dose not yet taken that day.
        select s into v_slot from unnest(v_slots) with ordinality a(s, n)
        where not exists (select 1 from supplement_log l where l.supplement_id = v_id and l.taken_on = v_day and l.time = s)
        order by n limit 1;
        v_slot := coalesce(v_slot, v_slots[1]);
      else
        -- Un-ticking with no time: the latest dose taken that day.
        select s into v_slot from unnest(v_slots) with ordinality a(s, n)
        where exists (select 1 from supplement_log l where l.supplement_id = v_id and l.taken_on = v_day and l.time = s)
        order by n desc limit 1;
        v_slot := coalesce(v_slot, v_slots[1]);
      end if;

      if v_taken then
        insert into supplement_log (supplement_id, taken_on, time, logged_by)
        values (v_id, v_day, v_slot, v_label)
        on conflict (supplement_id, taken_on, time) do nothing;
        get diagnostics v_count = row_count;
      else
        delete from supplement_log where supplement_id = v_id and taken_on = v_day and time = v_slot;
        get diagnostics v_count = row_count;
      end if;
      v_changed := v_changed || jsonb_build_object(
        'supplement', v_row.name, 'time', v_slot, 'taken', v_taken,
        'note', case when v_count = 0 then case when v_taken then 'already logged' else 'was not logged' end end);
    end loop;
    v_result := jsonb_build_object('date', v_day, 'changed', v_changed, 'day', meals_supplement_day(v_day));

  else
    raise exception 'Unknown supplement action "%".', p_action using errcode = '22023';
  end case;

  insert into meals_agent_actions (token_id, action, args, result)
  values (v_token_id, p_action, v_args, v_result);
  return v_result;
end;
$$;

-- ── Snapshot v4: v3 + supplements ───────────────────────────

do $$
begin
  if to_regprocedure('public.meals_kitchen_snapshot_v3(text)') is null then
    alter function public.get_kitchen_snapshot(text) rename to meals_kitchen_snapshot_v3;
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
  v_base jsonb;
begin
  v_base := meals_kitchen_snapshot_v3(p_token); -- checks the key
  return v_base
    || jsonb_build_object(
      'schema_version', 4,
      'supplements', meals_supplements_overview()
    )
    || jsonb_build_object('notes', (v_base -> 'notes') || jsonb_build_array(
      'supplements: what the owner takes, each with dose, times (morning / midday / evening / bedtime; empty = any time), status (taking / trying / paused), purpose and notes on how to take it; the schedule for today with what''s been taken, and doses taken vs due for the last 7 days. More with get_supplements; change them with save_supplement, delete_supplement and log_supplement.'
    ));
end;
$$;

-- ── Grants ──────────────────────────────────────────────────

revoke all on function public.meals_supplement_time(text, boolean) from public, anon, authenticated;
revoke all on function public.meals_supplement_times(jsonb) from public, anon, authenticated;
revoke all on function public.meals_supplement_resolve(text) from public, anon, authenticated;
revoke all on function public.meals_supplement_slots(text[]) from public, anon, authenticated;
revoke all on function public.meals_supplement_doc(public.supplements, date) from public, anon, authenticated;
revoke all on function public.meals_supplement_day(date) from public, anon, authenticated;
revoke all on function public.meals_supplements_overview() from public, anon, authenticated;
revoke all on function public.meals_kitchen_snapshot_v3(text) from public, anon, authenticated;

revoke all on function public.get_supplements(text, date, date) from public;
revoke all on function public.meals_agent_supplements(text, text, jsonb) from public;
revoke all on function public.get_kitchen_snapshot(text) from public;
grant execute on function public.get_supplements(text, date, date) to anon, authenticated, service_role;
grant execute on function public.meals_agent_supplements(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.get_kitchen_snapshot(text) to anon, authenticated, service_role;
