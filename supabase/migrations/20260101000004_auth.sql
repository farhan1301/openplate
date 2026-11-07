-- ============================================================
-- OPENPLATE — sign-in allowlist (email magic link or Google)
-- Step 1: allowlist + access check used by the app after sign-in.
-- Step 2: lock the meal tables to signed-in, allowlisted users only.
-- ============================================================

-- Step 1 ------------------------------------------------------
create table if not exists meals_allowlist (
  email      text primary key,
  active     boolean not null default true,
  created_at timestamptz default now()
);
alter table meals_allowlist enable row level security;

-- The owner's email is added at install time (see INSTALL.md), e.g.:
--   insert into meals_allowlist (email) values (lower('you@example.com'));

create or replace function meals_user_has_access()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from meals_allowlist a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid() and a.active
  )
$$;
revoke all on function meals_user_has_access() from public, anon;
grant execute on function meals_user_has_access() to authenticated;

-- Step 2 -------------------------------------------
-- Every existing policy on the meal tables is narrowed in place to signed-in,
-- allowlisted users. Not signed in = no rows, no writes.
do $$
declare p record;
begin
  for p in select tablename, policyname, cmd from pg_policies
           where schemaname = 'public'
             and tablename in ('meals','meal_ingredients','meal_categories','ingredients','ingredient_categories','pantry','shopping_cart','favorites') loop
    if p.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I to authenticated with check ((select public.meals_user_has_access()))', p.policyname, p.tablename);
    elsif p.cmd in ('UPDATE', 'ALL') then
      execute format('alter policy %I on public.%I to authenticated using ((select public.meals_user_has_access())) with check ((select public.meals_user_has_access()))', p.policyname, p.tablename);
    else
      execute format('alter policy %I on public.%I to authenticated using ((select public.meals_user_has_access()))', p.policyname, p.tablename);
    end if;
  end loop;
end $$;

-- To give someone else access:
--   insert into meals_allowlist (email) values (lower('someone@example.com'));
