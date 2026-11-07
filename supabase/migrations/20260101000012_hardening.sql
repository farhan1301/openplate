-- ============================================================
-- OPENPLATE — hardening from the Supabase security & performance advisors
--
-- * meals_settings_check_tz: pin search_path (advisor 0011).
-- * meals_tz(): signed-in users only (column defaults on the app's tables
--   need it; agent RPCs run as the function owner, so anon doesn't).
-- * create_meals_agent_token / list_meals_agent_tokens: superseded by
--   create_meals_agent_key / list_meals_agent_keys; nothing calls them, so
--   they're no longer exposed through the API.
-- * Indexes for the four foreign keys without one (advisor 0001).
--
-- Expected advisor notices that stay, by design:
-- * "RLS enabled, no policy" on meals_agent_tokens, meals_agent_actions,
--   meals_allowlist and meals_settings: nobody reads these directly; only
--   SECURITY DEFINER functions do.
-- * "anon/authenticated can execute SECURITY DEFINER function" for the
--   agent RPCs (get_kitchen_snapshot, meals_agent_write, …): that's the
--   agent API. Each one checks the agent key (or a signed-in allowlisted
--   member) itself before touching any data.
-- Safe to re-run.
-- ============================================================

alter function public.meals_settings_check_tz() set search_path = '';

revoke all on function public.meals_tz() from public, anon;
grant execute on function public.meals_tz() to authenticated, service_role;

revoke all on function public.create_meals_agent_token(text) from public, anon, authenticated;
revoke all on function public.list_meals_agent_tokens() from public, anon, authenticated;

create index if not exists idx_food_log_meal on public.food_log(meal_id);
create index if not exists idx_meals_agent_actions_token on public.meals_agent_actions(token_id);
create index if not exists idx_shopping_cart_meal on public.shopping_cart(meal_id);
create index if not exists idx_workout_log_routine on public.workout_log(routine_id);
