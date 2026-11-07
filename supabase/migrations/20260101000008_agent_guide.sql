-- ============================================================
-- OPENPLATE — editable kitchen guide (run after the agent-write migration)
--
-- * meals_agent_guide: one row holding the guide agents read (field
--   meanings, readiness rules, how to answer). content null = use the
--   built-in docs/MEALS_AGENT.md that ships with the app.
-- * get_meals_agent_guide(token): the stored guide, for an agent key or a
--   signed-in member. The API falls back to the built-in file when null.
-- * meals_agent_set_guide(token, content, base_updated_at): replaces the
--   guide (null resets it to the built-in one). Write-enabled keys only.
--   base_updated_at must match the guide the edit was made from, so two
--   agents editing at once can't silently overwrite each other. Every change
--   is logged in meals_agent_actions as "update_kitchen_guide".
--
-- Safe to re-run.
-- ============================================================

create table if not exists public.meals_agent_guide (
  id         int primary key default 1 check (id = 1),
  content    text check (content is null or length(content) <= 100000),
  updated_at timestamptz,
  updated_by text
);
insert into public.meals_agent_guide (id) values (1) on conflict (id) do nothing;

-- Members can read it and reset it from the app; agents go through the RPCs.
alter table public.meals_agent_guide enable row level security;
drop policy if exists "Members read meals_agent_guide" on public.meals_agent_guide;
drop policy if exists "Members update meals_agent_guide" on public.meals_agent_guide;
create policy "Members read meals_agent_guide" on public.meals_agent_guide
  for select to authenticated using ((select public.meals_user_has_access()));
create policy "Members update meals_agent_guide" on public.meals_agent_guide
  for update to authenticated
  using ((select public.meals_user_has_access()))
  with check ((select public.meals_user_has_access()));
revoke all on public.meals_agent_guide from anon;

create or replace function public.get_meals_agent_guide(p_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform meals_assert_can_read(p_token);
  return (
    select jsonb_build_object(
      'content', g.content,
      'customized', g.content is not null,
      'updated_at', g.updated_at,
      'updated_by', g.updated_by
    )
    from meals_agent_guide g
    where g.id = 1
  );
end;
$$;

create or replace function public.meals_agent_set_guide(p_token text, p_content text, p_base_updated_at timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_token_id bigint;
  v_label text;
  v_before text;
  v_before_at timestamptz;
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_result jsonb;
begin
  v_token_id := meals_agent_write_token_id(p_token);
  if v_token_id is null then
    raise exception 'This agent key is read-only. Turn on "Can make changes" for it in the app: profile picture → AI Access.' using errcode = '42501';
  end if;
  if v_content is not null and length(v_content) > 100000 then
    raise exception 'The guide can be at most 100,000 characters.' using errcode = '22023';
  end if;

  select content, updated_at into v_before, v_before_at
  from meals_agent_guide where id = 1
  for update;
  if v_before_at is distinct from p_base_updated_at then
    raise exception 'The guide changed since you read it. Read it again with get_kitchen_guide and redo your edit.' using errcode = '22023';
  end if;

  select label into v_label from meals_agent_tokens where id = v_token_id;
  update meals_agent_guide
  set content = v_content, updated_at = now(), updated_by = v_label
  where id = 1;

  v_result := jsonb_build_object(
    'customized', v_content is not null,
    'characters', length(v_content),
    'updated_at', (select updated_at from meals_agent_guide where id = 1)
  );
  -- Keep the previous text so the owner can recover it from the log.
  insert into meals_agent_actions (token_id, action, args, result)
  values (v_token_id, 'update_kitchen_guide',
          jsonb_build_object('reset', v_content is null, 'previous', v_before),
          v_result);
  return v_result;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────

revoke all on function public.get_meals_agent_guide(text) from public;
revoke all on function public.meals_agent_set_guide(text, text, timestamptz) from public;
grant execute on function public.get_meals_agent_guide(text) to anon, authenticated, service_role;
grant execute on function public.meals_agent_set_guide(text, text, timestamptz) to anon, authenticated, service_role;
