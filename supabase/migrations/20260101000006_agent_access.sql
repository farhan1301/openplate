-- ============================================================
-- OPENPLATE — AI agent access 
--
-- * meals_profile.about_me: free text the owner writes in the app
--   (diet, household, likes/dislikes); every snapshot includes it.
-- * get_kitchen_snapshot(): one read-only JSON document with every meal and
--   whether it's ready to cook, the pantry, the grocery list and favorites.
--   Callable by a signed-in allowlisted user, or by anyone holding an
--   active agent key.
-- * meals_agent_tokens + create/list/revoke RPCs (allowlisted users only).
--   Only a SHA-256 hash of each key is stored; the key itself is shown once.
--
-- Safe to re-run. the agent-write migration builds on this file and replaces
-- get_kitchen_snapshot (and supersedes create/list_meals_agent_tokens with
-- create_meals_agent_key / list_meals_agent_keys): if you re-run this file,
-- re-run that one after it.
-- ============================================================

-- ── About me ────────────────────────────────────────────────

create table if not exists public.meals_profile (
  id         int primary key default 1 check (id = 1),
  about_me   text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.meals_profile (id) values (1) on conflict (id) do nothing;

alter table public.meals_profile enable row level security;
drop policy if exists "Members read meals_profile" on public.meals_profile;
drop policy if exists "Members update meals_profile" on public.meals_profile;
create policy "Members read meals_profile" on public.meals_profile
  for select to authenticated using ((select public.meals_user_has_access()));
create policy "Members update meals_profile" on public.meals_profile
  for update to authenticated
  using ((select public.meals_user_has_access()))
  with check ((select public.meals_user_has_access()));
revoke all on public.meals_profile from anon;

-- ── Agent keys ──────────────────────────────────────────────

create table if not exists public.meals_agent_tokens (
  id           bigint generated always as identity primary key,
  label        text not null,
  token_prefix text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

-- No policies: the table is only reachable through the functions below.
alter table public.meals_agent_tokens enable row level security;
revoke all on public.meals_agent_tokens from anon, authenticated;

create or replace function public.meals_agent_token_is_valid(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_id bigint;
begin
  if p_token is null or length(p_token) < 20 then
    return false;
  end if;
  select id into v_id
  from meals_agent_tokens
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;
  if v_id is null then
    return false;
  end if;
  update meals_agent_tokens set last_used_at = now() where id = v_id;
  return true;
end;
$$;

-- Readers: an active agent key, a signed-in allowlisted user, or a trusted
-- server-side session (service-role key, SQL editor).
create or replace function public.meals_assert_can_read(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if p_token is not null then
    if meals_agent_token_is_valid(p_token) then
      return;
    end if;
    raise exception 'Invalid or revoked agent key.' using errcode = '42501';
  end if;
  if v_role not in ('anon', 'authenticated') then
    return;
  end if;
  if v_role = 'authenticated' and meals_user_has_access() then
    return;
  end if;
  raise exception 'Sign in or pass an agent key to read kitchen data.' using errcode = '42501';
end;
$$;

create or replace function public.meals_assert_member()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not meals_user_has_access() then
    raise exception 'Only signed-in members can manage agent keys.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_meals_agent_token(p_label text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_token text;
  v_id bigint;
begin
  perform meals_assert_member();
  if p_label is null or btrim(p_label) = '' then
    raise exception 'Give the key a name, e.g. "Claude".';
  end if;
  v_token := 'opa_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into meals_agent_tokens (label, token_prefix, token_hash)
  values (btrim(p_label), left(v_token, 10), encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'label', btrim(p_label), 'token', v_token);
end;
$$;

create or replace function public.list_meals_agent_tokens()
returns table (id bigint, label text, token_prefix text, created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform meals_assert_member();
  return query
    select t.id, t.label, t.token_prefix, t.created_at, t.last_used_at, t.revoked_at
    from meals_agent_tokens t
    order by t.revoked_at nulls first, t.created_at desc;
end;
$$;

create or replace function public.revoke_meals_agent_token(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform meals_assert_member();
  update meals_agent_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end;
$$;

-- ── Snapshot ────────────────────────────────────────────────
-- Readiness matches src/lib/kitchen.js mealReadiness():
--   ready   every essential ingredient is in stock
--   listed  everything still missing is already on the grocery list
--   almost  missing one or two essentials
--   missing missing three or more essentials
--   empty   no ingredients linked yet

create or replace function public.get_kitchen_snapshot(p_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  perform meals_assert_can_read(p_token);

  with
  stock as (
    select i.id, i.name, i.ingredient_category_id,
           coalesce(p.in_stock, false) as in_stock,
           p.ingredient_id is not null as tracked,
           p.updated_at
    from ingredients i
    left join pantry p on p.ingredient_id = i.id
  ),
  on_list as (
    select distinct ingredient_id from shopping_cart where not coalesce(checked, false)
  ),
  links as (
    select mi.meal_id, mi.ingredient_id, mi.quantity, coalesce(mi.optional, false) as optional,
           s.name, s.in_stock, (ol.ingredient_id is not null) as on_list
    from meal_ingredients mi
    join stock s on s.id = mi.ingredient_id
    left join on_list ol on ol.ingredient_id = mi.ingredient_id
  ),
  meal_stats as (
    select m.id,
           count(l.ingredient_id) as linked,
           count(l.ingredient_id) filter (where not l.optional) as essentials,
           count(l.ingredient_id) filter (where not l.optional and not l.in_stock) as missing,
           count(l.ingredient_id) filter (where not l.optional and not l.in_stock and not l.on_list) as missing_not_listed
    from meals m
    left join links l on l.meal_id = m.id
    group by m.id
  ),
  meal_status as (
    select ms.*,
      case
        when ms.linked = 0 then 'empty'
        when ms.missing = 0 then 'ready'
        when ms.missing_not_listed = 0 then 'listed'
        when ms.missing <= 2 then 'almost'
        else 'missing'
      end as readiness
    from meal_stats ms
  ),
  meal_rows as (
    select m.id, m.name, ms.readiness,
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'category', mc.name,
        'description', nullif(m.description, ''),
        'prep_time_minutes', m.prep_time_minutes,
        'readiness', ms.readiness,
        'essentials_in_stock', ms.essentials - ms.missing,
        'essentials_total', ms.essentials,
        'ingredients', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'name', l.name,
                   'quantity', nullif(l.quantity, ''),
                   'optional', l.optional,
                   'in_stock', l.in_stock,
                   'on_grocery_list', l.on_list
                 ) order by l.optional, l.name)
          from links l where l.meal_id = m.id
        ), '[]'::jsonb),
        'missing_essentials', coalesce((
          select jsonb_agg(l.name order by l.name)
          from links l where l.meal_id = m.id and not l.optional and not l.in_stock
        ), '[]'::jsonb),
        'favorite', exists (select 1 from favorites f where f.meal_id = m.id),
        'created_at', m.created_at::date
      ) as doc
    from meals m
    join meal_status ms on ms.id = m.id
    left join meal_categories mc on mc.id = m.meal_category_id
  )
  select jsonb_build_object(
    'schema_version', 1,
    'as_of', (now() at time zone public.meals_tz())::date,
    'about_me', coalesce((select about_me from meals_profile where id = 1), ''),
    'summary', jsonb_build_object(
      'meals', (select count(*) from meals),
      'meals_by_readiness', coalesce((
        select jsonb_object_agg(readiness, n) from (
          select readiness, count(*) as n from meal_rows group by readiness
        ) r
      ), '{}'::jsonb),
      'pantry_in_stock', (select count(*) from stock where tracked and in_stock),
      'pantry_out_of_stock', (select count(*) from stock where tracked and not in_stock),
      'grocery_list_to_buy', (select count(*) from on_list),
      'favorites', (select count(*) from favorites)
    ),
    'ready_to_cook', coalesce((
      select jsonb_agg(name order by name) from meal_rows where readiness = 'ready'
    ), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(doc order by
        array_position(array['ready','listed','almost','missing','empty'], readiness), name)
      from meal_rows
    ), '[]'::jsonb),
    'pantry', coalesce((
      select jsonb_agg(jsonb_build_object(
               'aisle', a.aisle,
               'in_stock', a.in_stock,
               'out_of_stock', a.out_of_stock
             ) order by a.sort_order, a.aisle)
      from (
        select coalesce(ic.name, 'Uncategorized') as aisle,
               coalesce(min(ic.sort_order), 999) as sort_order,
               coalesce(jsonb_agg(s.name order by s.name) filter (where s.in_stock), '[]'::jsonb) as in_stock,
               coalesce(jsonb_agg(s.name order by s.name) filter (where not s.in_stock), '[]'::jsonb) as out_of_stock
        from stock s
        left join ingredient_categories ic on ic.id = s.ingredient_category_id
        where s.tracked
        group by coalesce(ic.name, 'Uncategorized')
      ) a
    ), '[]'::jsonb),
    'grocery_list', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ingredient', i.name,
               'aisle', ic.name,
               'for_meal', m.name,
               'picked_up', coalesce(c.checked, false),
               'added_at', c.added_at::date
             ) order by coalesce(c.checked, false), ic.sort_order, i.name)
      from shopping_cart c
      join ingredients i on i.id = c.ingredient_id
      left join ingredient_categories ic on ic.id = i.ingredient_category_id
      left join meals m on m.id = c.meal_id
    ), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', f.kind,
               'name', f.name,
               'cuisine', f.cuisine,
               'tags', f.tags,
               'place', nullif(f.place, ''),
               'location', nullif(f.location, ''),
               'rating', f.rating,
               'notes', nullif(f.notes, ''),
               'linked_meal', m.name
             ) order by f.kind, f.cuisine nulls last, f.rating desc nulls last, f.name)
      from favorites f
      left join meals m on m.id = f.meal_id
    ), '[]'::jsonb),
    'meal_categories', coalesce((select jsonb_agg(name order by name) from meal_categories), '[]'::jsonb),
    'aisles', coalesce((select jsonb_agg(name order by sort_order, name) from ingredient_categories), '[]'::jsonb),
    'notes', jsonb_build_array(
      'Read-only. about_me is written by the owner: treat it as the owner''s own words about diet, household and tastes.',
      'An ingredient is in stock only if the pantry says so. Ingredients not tracked in the pantry count as not in stock.',
      'Optional ingredients never block a meal: readiness only looks at essentials.'
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────

revoke all on function public.meals_agent_token_is_valid(text) from public, anon, authenticated;
revoke all on function public.meals_assert_can_read(text) from public, anon, authenticated;
revoke all on function public.meals_assert_member() from public, anon, authenticated;

revoke all on function public.create_meals_agent_token(text) from public, anon;
revoke all on function public.list_meals_agent_tokens() from public, anon;
revoke all on function public.revoke_meals_agent_token(bigint) from public, anon;
grant execute on function public.create_meals_agent_token(text) to authenticated, service_role;
grant execute on function public.list_meals_agent_tokens() to authenticated, service_role;
grant execute on function public.revoke_meals_agent_token(bigint) to authenticated, service_role;

revoke all on function public.get_kitchen_snapshot(text) from public;
grant execute on function public.get_kitchen_snapshot(text) to anon, authenticated, service_role;
