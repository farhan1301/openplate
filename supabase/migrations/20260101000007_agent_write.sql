-- ============================================================
-- OPENPLATE — let AI agents make changes 
--
-- * meals_agent_tokens.can_write: keys stay read-only unless the owner turns
--   changes on for that key (AI Access). Existing keys stay read-only.
--   create_meals_agent_key(label, can_write) / list_meals_agent_keys() /
--   set_meals_agent_token_write(id, can_write) manage it.
-- * meals_agent_write(token, action, args): the single entry point agents
--   use to change data. It checks the key, then applies the same rules the
--   app does (src/lib/useKitchen.js):
--     - in stock → drops the item's "to buy" grocery rows; out of stock →
--       drops stale "picked up" rows
--     - picking an item up marks it in stock (and un-picking puts it back)
--     - new meal ingredients join the pantry as out of stock
--     - removing an ingredient from a meal, or deleting a meal, drops its
--       unbought grocery rows
--   Actions: set_stock, add_ingredient, update_ingredient, delete_ingredient,
--   add_to_grocery_list, add_meal_to_grocery_list, mark_picked_up,
--   remove_from_grocery_list, create_meal, update_meal, delete_meal,
--   add_favorite, update_favorite, delete_favorite.
-- * meals_agent_actions: every agent change, with the key that made it.
--   Members read it with list_meals_agent_actions().
-- * get_kitchen_snapshot() v2: adds favorite ids, the ingredients that aren't
--   tracked in the pantry, and `access.can_write`. Photos (image_url, from
--   the images migration; run that first) are added in the app only: the
--   snapshot leaves them out and the agent API (api/_lib/meals.js) doesn't
--   pass image_url through, though meals_agent_write still accepts it.
--
-- Safe to re-run.
-- ============================================================

-- ── Keys ────────────────────────────────────────────────────

alter table public.meals_agent_tokens
  add column if not exists can_write boolean not null default false;

-- Key → id of an active, write-enabled key, or null.
create or replace function public.meals_agent_write_token_id(p_token text)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select id
  from meals_agent_tokens
  where p_token is not null and length(p_token) >= 20
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and can_write
$$;

-- create_meals_agent_key / list_meals_agent_keys replace
-- create_meals_agent_token / list_meals_agent_tokens (which stay, unchanged,
-- so older app builds keep working; new names avoid dropping them).
create or replace function public.create_meals_agent_key(p_label text, p_can_write boolean default false)
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
  insert into meals_agent_tokens (label, token_prefix, token_hash, can_write)
  values (btrim(p_label), left(v_token, 10), encode(extensions.digest(v_token, 'sha256'), 'hex'), coalesce(p_can_write, false))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'label', btrim(p_label), 'token', v_token, 'can_write', coalesce(p_can_write, false));
end;
$$;

create or replace function public.list_meals_agent_keys()
returns table (id bigint, label text, token_prefix text, can_write boolean, created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform meals_assert_member();
  return query
    select t.id, t.label, t.token_prefix, t.can_write, t.created_at, t.last_used_at, t.revoked_at
    from meals_agent_tokens t
    order by t.revoked_at nulls first, t.created_at desc;
end;
$$;

create or replace function public.set_meals_agent_token_write(p_id bigint, p_can_write boolean)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform meals_assert_member();
  update meals_agent_tokens
  set can_write = coalesce(p_can_write, false)
  where id = p_id and revoked_at is null;
end;
$$;

-- ── Audit log ───────────────────────────────────────────────

create table if not exists public.meals_agent_actions (
  id         bigint generated always as identity primary key,
  token_id   bigint not null references public.meals_agent_tokens(id),
  action     text not null,
  args       jsonb not null default '{}'::jsonb,
  result     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists meals_agent_actions_created_idx on public.meals_agent_actions (created_at desc);

-- No policies: only reachable through the functions below.
alter table public.meals_agent_actions enable row level security;
revoke all on public.meals_agent_actions from anon, authenticated;

create or replace function public.list_meals_agent_actions(p_limit integer default 20)
returns table (id bigint, token_label text, action text, args jsonb, result jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform meals_assert_member();
  return query
    select a.id, t.label, a.action, a.args, a.result, a.created_at
    from meals_agent_actions a
    join meals_agent_tokens t on t.id = a.token_id
    order by a.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 200);
end;
$$;

-- ── Lookups ─────────────────────────────────────────────────

create or replace function public.meals_agent_like(p_text text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select '%' || replace(replace(replace(btrim(coalesce(p_text, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Photo link for a meal or favorite: "" / null clears it; otherwise an http(s) URL.
create or replace function public.meals_agent_image_url(p_value text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_url text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_url is not null and (v_url !~* '^https?://[^\s]+$' or length(v_url) > 2000) then
    raise exception 'image_url must be a direct http(s) link to an image (or "" to remove the photo).' using errcode = '22023';
  end if;
  return v_url;
end;
$$;

-- A string or an array of strings → trimmed, non-empty text[] (null if none).
create or replace function public.meals_agent_names(p_value jsonb)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case jsonb_typeof(p_value)
    when 'string' then nullif(array_remove(array[btrim(p_value #>> '{}')], ''), '{}')
    when 'array' then (
      select nullif(array_agg(btrim(e) order by ord), '{}')
      from jsonb_array_elements_text(p_value) with ordinality as x(e, ord)
      where jsonb_typeof(p_value -> (ord::int - 1)) = 'string' and btrim(e) <> ''
    )
    else null
  end
$$;

-- An existing ingredient: exact name (case-insensitive), then singular /
-- plural ("egg" ↔ "eggs"), then, when p_partial, a unique partial match.
-- Null when nothing matches; raises when a partial match is ambiguous.
create or replace function public.meals_agent_find_ingredient(p_name text, p_partial boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_name text := lower(btrim(coalesce(p_name, '')));
  v_id uuid;
  v_ids uuid[];
  v_names text;
begin
  if v_name = '' then
    return null;
  end if;
  select id into v_id from ingredients where lower(name) = v_name limit 1;
  if v_id is not null then return v_id; end if;

  select id into v_id from ingredients
  where lower(name) in (v_name || 's', v_name || 'es', regexp_replace(v_name, 'es$', ''), regexp_replace(v_name, 's$', ''))
  order by length(name)
  limit 1;
  if v_id is not null or not p_partial then return v_id; end if;

  select array_agg(id), string_agg(name, ', ' order by name) into v_ids, v_names
  from ingredients where name ilike meals_agent_like(p_name);
  if array_length(v_ids, 1) = 1 then return v_ids[1]; end if;
  if array_length(v_ids, 1) > 1 then
    raise exception '"%" matches more than one ingredient: %. Use the exact name.', btrim(p_name), v_names using errcode = '22023';
  end if;
  return null;
end;
$$;

create or replace function public.meals_agent_ingredient(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_id uuid := meals_agent_find_ingredient(p_name, true);
begin
  if v_id is null then
    raise exception 'No ingredient called "%". Add it with add_ingredient (or add_to_grocery_list, which creates it).', btrim(coalesce(p_name, '')) using errcode = '22023';
  end if;
  return v_id;
end;
$$;

-- Aisle (ingredient category) or meal category by name → id. Null for an
-- empty name; raises with the options when nothing matches.
create or replace function public.meals_agent_category(p_kind text, p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_ids uuid[];
  v_options text;
begin
  if v_name = '' then
    return null;
  end if;
  if p_kind = 'aisle' then
    select array_agg(id) into v_ids from ingredient_categories where lower(name) = lower(v_name);
    if v_ids is null then
      select array_agg(id) into v_ids from ingredient_categories where name ilike meals_agent_like(v_name);
    end if;
    select string_agg(name, ', ' order by sort_order, name) into v_options from ingredient_categories;
  else
    select array_agg(id) into v_ids from meal_categories where lower(name) = lower(v_name);
    if v_ids is null then
      select array_agg(id) into v_ids from meal_categories where name ilike meals_agent_like(v_name);
    end if;
    select string_agg(name, ', ' order by name) into v_options from meal_categories;
  end if;
  if v_ids is null or array_length(v_ids, 1) > 1 then
    raise exception 'No % called "%". Options: %.', case when p_kind = 'aisle' then 'aisle' else 'meal category' end, v_name, v_options using errcode = '22023';
  end if;
  return v_ids[1];
end;
$$;

-- Meal or favorite by id or name: exact (case-insensitive), then a unique
-- partial match. p_kind: 'meal' or 'favorite'.
create or replace function public.meals_agent_resolve(p_kind text, p_ref text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ref text := btrim(coalesce(p_ref, ''));
  v_ids uuid[];
  v_names text;
begin
  if v_ref = '' then
    raise exception 'Say which % (name or id).', p_kind using errcode = '22023';
  end if;
  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if p_kind = 'meal' then
      select array_agg(id) into v_ids from meals where id = v_ref::uuid;
    else
      select array_agg(id) into v_ids from favorites where id = v_ref::uuid;
    end if;
  end if;
  if v_ids is null then
    if p_kind = 'meal' then
      select array_agg(id), string_agg(name || ' (id ' || id || ')', ', ') into v_ids, v_names from meals where lower(name) = lower(v_ref);
    else
      select array_agg(id), string_agg(name || coalesce(' @ ' || nullif(place, ''), '') || ' (id ' || id || ')', ', ') into v_ids, v_names from favorites where lower(name) = lower(v_ref);
    end if;
  end if;
  if v_ids is null then
    if p_kind = 'meal' then
      select array_agg(id), string_agg(name || ' (id ' || id || ')', ', ') into v_ids, v_names from meals where name ilike meals_agent_like(v_ref);
    else
      select array_agg(id), string_agg(name || coalesce(' @ ' || nullif(place, ''), '') || ' (id ' || id || ')', ', ') into v_ids, v_names from favorites where name ilike meals_agent_like(v_ref);
    end if;
  end if;
  if v_ids is null then
    raise exception 'No % matches "%". Check the snapshot for the exact name.', p_kind, v_ref using errcode = '22023';
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception '"%" matches more than one %: %. Pass the id.', v_ref, p_kind, v_names using errcode = '22023';
  end if;
  return v_ids[1];
end;
$$;

-- Existing ingredient (exact or singular/plural) or a new one. Fills in a
-- missing aisle on an existing ingredient. Doesn't touch the pantry.
create or replace function public.meals_agent_ensure_ingredient(p_name text, p_aisle uuid, out id uuid, out created boolean)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Ingredient name is required.' using errcode = '22023';
  end if;
  id := meals_agent_find_ingredient(p_name, false);
  created := id is null;
  if created then
    insert into ingredients (name, ingredient_category_id) values (btrim(p_name), p_aisle) returning ingredients.id into id;
  elsif p_aisle is not null then
    update ingredients set ingredient_category_id = p_aisle where ingredients.id = meals_agent_ensure_ingredient.id and ingredient_category_id is null;
  end if;
end;
$$;

-- Marks ingredients in or out of stock and drops grocery rows that no longer
-- make sense (same as setStock in the app). Returns the rows removed.
create or replace function public.meals_agent_set_stock(p_ids uuid[], p_in_stock boolean)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_removed integer;
begin
  insert into pantry (ingredient_id, in_stock, updated_at)
  select unnest(p_ids), p_in_stock, now()
  on conflict (ingredient_id) do update set in_stock = excluded.in_stock, updated_at = now();
  delete from shopping_cart where ingredient_id = any(p_ids) and coalesce(checked, false) <> p_in_stock;
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

create or replace function public.meals_agent_ingredient_names(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from ingredients where id = any(p_ids)
$$;

-- ── Snapshot v2 ─────────────────────────────────────────────

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
           p.ingredient_id is not null as tracked
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
    'schema_version', 2,
    'as_of', (now() at time zone public.meals_tz())::date,
    'access', jsonb_build_object(
      'via', case when p_token is null then 'member' else 'agent_key' end,
      'can_write', p_token is null or meals_agent_write_token_id(p_token) is not null
    ),
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
    'untracked_ingredients', coalesce((
      select jsonb_agg(name order by name) from stock where not tracked
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
               'id', f.id,
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
      'about_me is written by the owner: treat it as the owner''s own words about diet, household and tastes.',
      'An ingredient is in stock only if the pantry says so. Ingredients not tracked in the pantry count as not in stock.',
      'Optional ingredients never block a meal: readiness only looks at essentials.',
      'access.can_write says whether this key may change data (see the guide''s "Making changes" section).'
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── Writes ──────────────────────────────────────────────────

create or replace function public.meals_agent_write(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_token_id bigint;
  v_result jsonb;
  v_names text[];
  v_name text;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_meal uuid;
  v_aisle uuid;
  v_bool boolean;
  v_count integer;
  v_int integer;
  v_added text[] := '{}';
  v_skipped text[] := '{}';
  v_created text[] := '{}';
  v_in_stock text[] := '{}';
  v_item jsonb;
  v_entry jsonb;
  v_ing record;
  v_ready jsonb;
begin
  if meals_agent_token_is_valid(p_token) is not true then
    raise exception 'Invalid or revoked agent key.' using errcode = '42501';
  end if;
  v_token_id := meals_agent_write_token_id(p_token);
  if v_token_id is null then
    raise exception 'This agent key is read-only. Turn on "Can make changes" for it in the app: profile picture → AI Access.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_args) <> 'object' then
    raise exception 'Arguments must be a JSON object.' using errcode = '22023';
  end if;

  case p_action

  -- ── Pantry ──
  when 'set_stock' then
    v_names := meals_agent_names(v_args -> 'ingredients');
    if v_names is null then raise exception 'ingredients is required (a name or a list of names).' using errcode = '22023'; end if;
    v_bool := coalesce((v_args ->> 'in_stock')::boolean, true);
    foreach v_name in array v_names loop
      v_ids := v_ids || meals_agent_ingredient(v_name);
    end loop;
    v_count := meals_agent_set_stock(v_ids, v_bool);
    v_result := jsonb_build_object(
      'ingredients', meals_agent_ingredient_names(v_ids),
      'in_stock', v_bool,
      'grocery_rows_removed', v_count);

  when 'add_ingredient' then
    v_aisle := meals_agent_category('aisle', v_args ->> 'aisle');
    select * into v_ing from meals_agent_ensure_ingredient(v_args ->> 'name', v_aisle);
    v_bool := coalesce((v_args ->> 'in_stock')::boolean, true);
    v_count := meals_agent_set_stock(array[v_ing.id], v_bool);
    v_result := jsonb_build_object(
      'ingredient', (select name from ingredients where id = v_ing.id),
      'aisle', (select ic.name from ingredients i left join ingredient_categories ic on ic.id = i.ingredient_category_id where i.id = v_ing.id),
      'already_existed', not v_ing.created,
      'in_stock', v_bool,
      'grocery_rows_removed', v_count);

  when 'update_ingredient' then
    v_id := meals_agent_ingredient(v_args ->> 'ingredient');
    v_name := nullif(btrim(coalesce(v_args ->> 'name', '')), '');
    if v_name is not null and exists (select 1 from ingredients where lower(name) = lower(v_name) and id <> v_id) then
      raise exception 'Another ingredient is already called "%".', v_name using errcode = '22023';
    end if;
    if v_name is null and nullif(btrim(coalesce(v_args ->> 'aisle', '')), '') is null then
      raise exception 'Pass a new name and/or aisle.' using errcode = '22023';
    end if;
    v_aisle := meals_agent_category('aisle', v_args ->> 'aisle');
    v_result := jsonb_build_object('before', (select jsonb_build_object('name', i.name, 'aisle', ic.name)
      from ingredients i left join ingredient_categories ic on ic.id = i.ingredient_category_id where i.id = v_id));
    update ingredients
    set name = coalesce(v_name, name),
        ingredient_category_id = coalesce(v_aisle, ingredient_category_id)
    where id = v_id;
    v_result := v_result || jsonb_build_object('after', (select jsonb_build_object('name', i.name, 'aisle', ic.name)
      from ingredients i left join ingredient_categories ic on ic.id = i.ingredient_category_id where i.id = v_id));

  when 'delete_ingredient' then
    v_id := meals_agent_ingredient(v_args ->> 'ingredient');
    v_result := jsonb_build_object(
      'deleted', (select name from ingredients where id = v_id),
      'removed_from_meals', coalesce((select jsonb_agg(m.name order by m.name) from meal_ingredients mi join meals m on m.id = mi.meal_id where mi.ingredient_id = v_id), '[]'::jsonb));
    delete from ingredients where id = v_id;

  -- ── Grocery list ──
  when 'add_to_grocery_list' then
    v_names := meals_agent_names(v_args -> 'ingredients');
    if v_names is null then raise exception 'ingredients is required (a name or a list of names).' using errcode = '22023'; end if;
    v_aisle := meals_agent_category('aisle', v_args ->> 'aisle');
    if nullif(btrim(coalesce(v_args ->> 'for_meal', '')), '') is not null then
      v_meal := meals_agent_resolve('meal', v_args ->> 'for_meal');
    end if;
    foreach v_name in array v_names loop
      select * into v_ing from meals_agent_ensure_ingredient(v_name, v_aisle);
      if v_ing.created then v_created := v_created || btrim(v_name); end if;
      if exists (select 1 from shopping_cart where ingredient_id = v_ing.id and not coalesce(checked, false)) then
        v_skipped := v_skipped || (select name from ingredients where id = v_ing.id);
        continue;
      end if;
      delete from shopping_cart where ingredient_id = v_ing.id and meal_id is not distinct from v_meal;
      insert into shopping_cart (ingredient_id, meal_id, checked) values (v_ing.id, v_meal, false);
      v_added := v_added || (select name from ingredients where id = v_ing.id);
      if exists (select 1 from pantry where ingredient_id = v_ing.id and in_stock) then
        v_in_stock := v_in_stock || (select name from ingredients where id = v_ing.id);
      end if;
    end loop;
    v_result := jsonb_build_object(
      'added', to_jsonb(v_added),
      'already_on_list', to_jsonb(v_skipped),
      'added_but_pantry_says_in_stock', to_jsonb(v_in_stock),
      'new_ingredients_created', to_jsonb(v_created),
      'for_meal', (select name from meals where id = v_meal));

  when 'add_meal_to_grocery_list' then
    v_meal := meals_agent_resolve('meal', v_args ->> 'meal');
    v_bool := coalesce((v_args ->> 'include_optional')::boolean, false);
    for v_ing in
      select mi.ingredient_id as id, i.name
      from meal_ingredients mi
      join ingredients i on i.id = mi.ingredient_id
      left join pantry p on p.ingredient_id = mi.ingredient_id
      where mi.meal_id = v_meal
        and not coalesce(p.in_stock, false)
        and (v_bool or not coalesce(mi.optional, false))
      order by i.name
    loop
      if exists (select 1 from shopping_cart where ingredient_id = v_ing.id and not coalesce(checked, false)) then
        v_skipped := v_skipped || v_ing.name;
        continue;
      end if;
      delete from shopping_cart where ingredient_id = v_ing.id and meal_id = v_meal;
      insert into shopping_cart (ingredient_id, meal_id, checked) values (v_ing.id, v_meal, false);
      v_added := v_added || v_ing.name;
    end loop;
    v_result := jsonb_build_object(
      'meal', (select name from meals where id = v_meal),
      'added', to_jsonb(v_added),
      'already_on_list', to_jsonb(v_skipped));

  when 'mark_picked_up' then
    v_names := meals_agent_names(v_args -> 'ingredients');
    if v_names is null then raise exception 'ingredients is required (a name or a list of names).' using errcode = '22023'; end if;
    v_bool := coalesce((v_args ->> 'picked_up')::boolean, true);
    foreach v_name in array v_names loop
      v_id := meals_agent_ingredient(v_name);
      if not exists (select 1 from shopping_cart where ingredient_id = v_id) then
        raise exception '"%" isn''t on the grocery list. Use set_stock to mark it in stock.', (select name from ingredients where id = v_id) using errcode = '22023';
      end if;
      v_ids := v_ids || v_id;
    end loop;
    update shopping_cart set checked = v_bool where ingredient_id = any(v_ids);
    -- Picking an item up means it's now in the pantry; un-checking it puts it back to "needed".
    insert into pantry (ingredient_id, in_stock, updated_at)
    select unnest(v_ids), v_bool, now()
    on conflict (ingredient_id) do update set in_stock = excluded.in_stock, updated_at = now();
    v_result := jsonb_build_object('ingredients', meals_agent_ingredient_names(v_ids), 'picked_up', v_bool, 'in_stock', v_bool);

  when 'remove_from_grocery_list' then
    v_names := meals_agent_names(v_args -> 'ingredients');
    v_name := nullif(btrim(coalesce(v_args ->> 'clear', '')), '');
    if (v_names is null) = (v_name is null) then
      raise exception 'Pass either ingredients (names) or clear ("picked_up" or "all").' using errcode = '22023';
    end if;
    if v_name is not null then
      if v_name not in ('picked_up', 'all') then
        raise exception 'clear must be "picked_up" or "all".' using errcode = '22023';
      end if;
      select coalesce(jsonb_agg(i.name order by i.name), '[]'::jsonb) into v_result
      from shopping_cart c join ingredients i on i.id = c.ingredient_id
      where v_name = 'all' or coalesce(c.checked, false);
      delete from shopping_cart where v_name = 'all' or coalesce(checked, false);
      v_result := jsonb_build_object('removed', v_result, 'cleared', v_name);
    else
      foreach v_name in array v_names loop
        v_id := meals_agent_ingredient(v_name);
        if not exists (select 1 from shopping_cart where ingredient_id = v_id) then
          raise exception '"%" isn''t on the grocery list.', (select name from ingredients where id = v_id) using errcode = '22023';
        end if;
        v_ids := v_ids || v_id;
      end loop;
      delete from shopping_cart where ingredient_id = any(v_ids);
      v_result := jsonb_build_object('removed', meals_agent_ingredient_names(v_ids));
    end if;

  -- ── Meals ──
  when 'create_meal', 'update_meal' then
    if p_action = 'create_meal' then
      v_name := nullif(btrim(coalesce(v_args ->> 'name', '')), '');
      if v_name is null then raise exception 'name is required.' using errcode = '22023'; end if;
      if not coalesce((v_args ->> 'allow_duplicate')::boolean, false)
         and exists (select 1 from meals where lower(name) = lower(v_name)) then
        raise exception 'A meal called "%" already exists. Use update_meal, or pass allow_duplicate: true.', v_name using errcode = '22023';
      end if;
      insert into meals (name) values (v_name) returning id into v_meal;
    else
      v_meal := meals_agent_resolve('meal', v_args ->> 'meal');
      v_name := nullif(btrim(coalesce(v_args ->> 'name', '')), '');
      if v_name is not null then update meals set name = v_name where id = v_meal; end if;
    end if;

    if v_args ? 'category' then
      update meals set meal_category_id = meals_agent_category('meal', v_args ->> 'category') where id = v_meal;
    end if;
    if v_args ? 'prep_time_minutes' then
      begin
        v_int := nullif(v_args ->> 'prep_time_minutes', '')::integer;
      exception when others then
        raise exception 'prep_time_minutes must be a whole number.' using errcode = '22023';
      end;
      if v_int is not null and (v_int < 0 or v_int > 1440) then
        raise exception 'prep_time_minutes must be between 0 and 1440.' using errcode = '22023';
      end if;
      update meals set prep_time_minutes = nullif(v_int, 0) where id = v_meal;
    end if;
    if v_args ? 'description' then
      update meals set description = nullif(btrim(coalesce(v_args ->> 'description', '')), '') where id = v_meal;
    end if;
    if v_args ? 'image_url' then
      update meals set image_url = meals_agent_image_url(v_args ->> 'image_url') where id = v_meal;
    end if;

    -- remove_ingredients (update only): names among the meal's ingredients.
    v_names := meals_agent_names(v_args -> 'remove_ingredients');
    if v_names is not null then
      foreach v_name in array v_names loop
        select array_agg(mi.ingredient_id) into v_ids
        from meal_ingredients mi join ingredients i on i.id = mi.ingredient_id
        where mi.meal_id = v_meal and lower(i.name) = lower(v_name);
        if v_ids is null then
          select array_agg(mi.ingredient_id) into v_ids
          from meal_ingredients mi join ingredients i on i.id = mi.ingredient_id
          where mi.meal_id = v_meal and i.name ilike meals_agent_like(v_name);
        end if;
        if v_ids is null or array_length(v_ids, 1) <> 1 then
          raise exception '"%" isn''t one of this meal''s ingredients (or matches more than one).', v_name using errcode = '22023';
        end if;
        delete from meal_ingredients where meal_id = v_meal and ingredient_id = v_ids[1];
        -- Items still on the grocery list only for this meal aren't needed any more.
        delete from shopping_cart where meal_id = v_meal and not coalesce(checked, false) and ingredient_id = v_ids[1];
        v_skipped := v_skipped || (select name from ingredients where id = v_ids[1]);
      end loop;
    end if;

    -- ingredients (create) / add_ingredients (update): add or update links.
    v_item := coalesce(v_args -> 'ingredients', v_args -> 'add_ingredients');
    if v_item is not null and jsonb_typeof(v_item) = 'string' then v_item := jsonb_build_array(v_item); end if;
    if v_item is not null and jsonb_typeof(v_item) <> 'array' then
      raise exception 'ingredients must be a list of names or {name, quantity, optional, aisle} objects.' using errcode = '22023';
    end if;
    for v_entry in select value from jsonb_array_elements(coalesce(v_item, '[]'::jsonb)) loop
      if jsonb_typeof(v_entry) = 'string' then
        v_entry := jsonb_build_object('name', v_entry #>> '{}');
      end if;
      v_aisle := meals_agent_category('aisle', v_entry ->> 'aisle');
      select * into v_ing from meals_agent_ensure_ingredient(v_entry ->> 'name', v_aisle);
      if v_ing.created then v_created := v_created || btrim(v_entry ->> 'name'); end if;
      -- New ingredients join the pantry (as "out") so they can be tracked later.
      insert into pantry (ingredient_id, in_stock) values (v_ing.id, false) on conflict (ingredient_id) do nothing;
      insert into meal_ingredients (meal_id, ingredient_id, quantity, optional)
      values (v_meal, v_ing.id, nullif(btrim(coalesce(v_entry ->> 'quantity', '')), ''), coalesce((v_entry ->> 'optional')::boolean, false))
      on conflict (meal_id, ingredient_id) do update
        set quantity = case when v_entry ? 'quantity' then excluded.quantity else meal_ingredients.quantity end,
            optional = case when v_entry ? 'optional' then excluded.optional else meal_ingredients.optional end;
      v_added := v_added || (select name from ingredients where id = v_ing.id);
    end loop;

    v_result := jsonb_build_object(
      'meal', (select m from jsonb_array_elements(get_kitchen_snapshot(p_token) -> 'meals') m where m ->> 'id' = v_meal::text),
      'ingredients_added_or_updated', to_jsonb(v_added),
      'ingredients_removed', to_jsonb(v_skipped),
      'new_ingredients_created', to_jsonb(v_created));

  when 'delete_meal' then
    v_meal := meals_agent_resolve('meal', v_args ->> 'meal');
    v_result := jsonb_build_object('deleted', (select jsonb_build_object('name', m.name, 'category', mc.name,
        'ingredients', (select jsonb_agg(i.name order by i.name) from meal_ingredients mi join ingredients i on i.id = mi.ingredient_id where mi.meal_id = m.id))
      from meals m left join meal_categories mc on mc.id = m.meal_category_id where m.id = v_meal));
    delete from shopping_cart where meal_id = v_meal and not coalesce(checked, false);
    delete from meals where id = v_meal;

  -- ── Favorites ──
  when 'add_favorite', 'update_favorite' then
    if p_action = 'update_favorite' then
      v_id := meals_agent_resolve('favorite', v_args ->> 'favorite');
    end if;
    if v_args ? 'kind' and coalesce(v_args ->> 'kind', '') not in ('dish', 'restaurant') then
      raise exception 'kind must be "dish" or "restaurant".' using errcode = '22023';
    end if;
    if v_args ? 'rating' and v_args ->> 'rating' is not null then
      begin
        v_int := nullif(nullif(v_args ->> 'rating', ''), '0')::integer;
      exception when others then
        raise exception 'rating must be a whole number from 1 to 5.' using errcode = '22023';
      end;
      if v_int not between 1 and 5 then
        raise exception 'rating must be from 1 to 5 (0 clears it).' using errcode = '22023';
      end if;
    end if;
    if v_args ? 'tags' and v_args -> 'tags' <> 'null'::jsonb and jsonb_typeof(v_args -> 'tags') <> 'array' then
      raise exception 'tags must be a list of strings.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(v_args ->> 'meal', '')), '') is not null then
      v_meal := meals_agent_resolve('meal', v_args ->> 'meal');
    end if;

    if p_action = 'add_favorite' then
      v_name := nullif(btrim(coalesce(v_args ->> 'name', '')), '');
      if v_name is null then raise exception 'name is required.' using errcode = '22023'; end if;
      if not (v_args ? 'kind') then raise exception 'kind is required: "dish" or "restaurant".' using errcode = '22023'; end if;
      if not coalesce((v_args ->> 'allow_duplicate')::boolean, false) and exists (
        select 1 from favorites
        where kind = v_args ->> 'kind' and lower(name) = lower(v_name)
          and lower(coalesce(place, '')) = lower(coalesce(btrim(v_args ->> 'place'), coalesce(case when v_meal is not null then 'Home' end, '')))
      ) then
        raise exception 'That favorite already exists. Use update_favorite, or pass allow_duplicate: true.' using errcode = '22023';
      end if;
      insert into favorites (kind, name, cuisine, tags, place, location, rating, notes, meal_id, image_url)
      values (
        v_args ->> 'kind', v_name,
        nullif(btrim(coalesce(v_args ->> 'cuisine', '')), ''),
        coalesce((select array_agg(btrim(t)) from jsonb_array_elements_text(coalesce(nullif(v_args -> 'tags', 'null'::jsonb), '[]'::jsonb)) t where btrim(t) <> ''), '{}'),
        coalesce(nullif(btrim(coalesce(v_args ->> 'place', '')), ''), case when v_meal is not null then 'Home' end),
        nullif(btrim(coalesce(v_args ->> 'location', '')), ''),
        v_int,
        nullif(btrim(coalesce(v_args ->> 'notes', '')), ''),
        v_meal,
        meals_agent_image_url(v_args ->> 'image_url')
      ) returning id into v_id;
    else
      v_result := jsonb_build_object('before', (select to_jsonb(f) - 'created_at' from favorites f where id = v_id));
      update favorites set
        kind = case when v_args ? 'kind' then v_args ->> 'kind' else kind end,
        name = coalesce(nullif(btrim(coalesce(v_args ->> 'name', '')), ''), name),
        cuisine = case when v_args ? 'cuisine' then nullif(btrim(coalesce(v_args ->> 'cuisine', '')), '') else cuisine end,
        tags = case when v_args ? 'tags' then coalesce((select array_agg(btrim(t)) from jsonb_array_elements_text(coalesce(nullif(v_args -> 'tags', 'null'::jsonb), '[]'::jsonb)) t where btrim(t) <> ''), '{}') else tags end,
        place = case when v_args ? 'place' then nullif(btrim(coalesce(v_args ->> 'place', '')), '') else place end,
        location = case when v_args ? 'location' then nullif(btrim(coalesce(v_args ->> 'location', '')), '') else location end,
        rating = case when v_args ? 'rating' then v_int else rating end,
        notes = case when v_args ? 'notes' then nullif(btrim(coalesce(v_args ->> 'notes', '')), '') else notes end,
        meal_id = case when v_args ? 'meal' then v_meal else meal_id end,
        image_url = case when v_args ? 'image_url' then meals_agent_image_url(v_args ->> 'image_url') else image_url end
      where id = v_id;
    end if;
    v_result := coalesce(v_result, '{}'::jsonb) || jsonb_build_object('favorite',
      (select to_jsonb(f) - 'created_at' - 'meal_id' || jsonb_build_object('linked_meal', m.name)
       from favorites f left join meals m on m.id = f.meal_id where f.id = v_id));

  when 'delete_favorite' then
    v_id := meals_agent_resolve('favorite', v_args ->> 'favorite');
    v_result := jsonb_build_object('deleted', (select to_jsonb(f) - 'created_at' from favorites f where id = v_id));
    delete from favorites where id = v_id;

  else
    raise exception 'Unknown action "%".', p_action using errcode = '22023';
  end case;

  -- What's cookable after the change, for actions that can change it.
  if p_action in ('set_stock', 'add_ingredient', 'delete_ingredient', 'mark_picked_up', 'create_meal', 'update_meal', 'delete_meal') then
    v_ready := get_kitchen_snapshot(p_token) -> 'ready_to_cook';
    v_result := v_result || jsonb_build_object('ready_to_cook_now', v_ready);
  end if;

  insert into meals_agent_actions (token_id, action, args, result)
  values (v_token_id, p_action, v_args, v_result);

  return v_result;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────
-- New functions are executable by PUBLIC by default. Only the agent entry
-- points are open to anon (they check the key themselves).

revoke all on function public.meals_agent_write_token_id(text) from public, anon, authenticated;
revoke all on function public.meals_agent_like(text) from public, anon, authenticated;
revoke all on function public.meals_agent_image_url(text) from public, anon, authenticated;
revoke all on function public.meals_agent_names(jsonb) from public, anon, authenticated;
revoke all on function public.meals_agent_find_ingredient(text, boolean) from public, anon, authenticated;
revoke all on function public.meals_agent_ingredient(text) from public, anon, authenticated;
revoke all on function public.meals_agent_category(text, text) from public, anon, authenticated;
revoke all on function public.meals_agent_resolve(text, text) from public, anon, authenticated;
revoke all on function public.meals_agent_ensure_ingredient(text, uuid) from public, anon, authenticated;
revoke all on function public.meals_agent_set_stock(uuid[], boolean) from public, anon, authenticated;
revoke all on function public.meals_agent_ingredient_names(uuid[]) from public, anon, authenticated;

revoke all on function public.create_meals_agent_key(text, boolean) from public, anon;
revoke all on function public.list_meals_agent_keys() from public, anon;
revoke all on function public.set_meals_agent_token_write(bigint, boolean) from public, anon;
revoke all on function public.list_meals_agent_actions(integer) from public, anon;
grant execute on function public.create_meals_agent_key(text, boolean) to authenticated, service_role;
grant execute on function public.list_meals_agent_keys() to authenticated, service_role;
grant execute on function public.set_meals_agent_token_write(bigint, boolean) to authenticated, service_role;
grant execute on function public.list_meals_agent_actions(integer) to authenticated, service_role;

revoke all on function public.get_kitchen_snapshot(text) from public;
revoke all on function public.meals_agent_write(text, text, jsonb) from public;
grant execute on function public.get_kitchen_snapshot(text) to anon, authenticated, service_role;
grant execute on function public.meals_agent_write(text, text, jsonb) to anon, authenticated, service_role;
