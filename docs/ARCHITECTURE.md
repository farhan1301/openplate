# Architecture & feature reference

How each part of OpenPlate works, for contributors and for AI agents changing the code. For setup see [INSTALL.md](../INSTALL.md).

## Demo mode
- `VITE_DEMO=true` swaps the Supabase client for `src/demo/client.js`: an in-memory stand-in that supports the query-builder calls the app makes (select with embeds, eq/in/is/gte/lte, order, limit, insert, update, upsert, delete, single/maybeSingle) and the RPCs the UI uses. Sample data is in `src/demo/seed.js`, dated relative to today. No sign-in, nothing persisted, creating agent keys explains that it's a demo. `src/components/DemoBanner.jsx` links to the repo.
- If you add a new query-builder method or table to the app, add it to the demo client and seed too.

## Sign-in and access
- Supabase Auth with an email magic link (works on every project with no setup). Google is optional: enable the provider in Supabase and set `VITE_ENABLE_GOOGLE_AUTH=true`.
- Only emails in `meals_allowlist` can read or write anything; every table's RLS policy checks `meals_user_has_access()` (`supabase/migrations/*_auth.sql`). Add someone: `insert into meals_allowlist (email) values (lower('someone@example.com'));`
- The app URL must be the Supabase Auth **Site URL** (or in **Redirect URLs**) so magic links come back to it.

## Time zone
- `meals_settings.timezone` (one row, default `UTC`) decides what "today" is for the food log, workouts, supplements and the snapshot's `as_of`. All SQL uses `public.meals_tz()`. Invalid zone names are rejected.
- Change it: `update meals_settings set timezone = 'Europe/London' where id = 1;`

## Home and photos
The app opens on **Home**: what you can cook tonight, favorite dishes, meals one shop away, the grocery list with the best next buys, and favorite restaurants, all as photo cards.

- `meals.image_url` / `favorites.image_url` hold each card's photo. Without one, a food emoji on a gradient is shown (`src/lib/foodArt.js`).
- Photos are uploaded in the meal and favorite editors to the public `meal-photos` Storage bucket (`src/lib/photos.js`), or pasted as an image link.
- Photos are added in the app only; the AI agent connector doesn't read or set them.
- `supabase/migrations/*_images.sql` adds the columns, bucket and upload policies (run it before `supabase/migrations/*_agent_write.sql`).

## Nutrition
The **Nutrition** tab tracks calories, protein, carbs, fat and fiber: today's totals against daily goals (target button), a meal-by-meal food log, and a 7-day calorie chart. Step back through earlier days with the arrows.

- Saved meals can hold nutrition per serving (meal editor → Nutrition per serving); **Log a serving as eaten** on a meal adds it to today.
- `food_log` stores each entry's totals (servings applied), so editing a meal later doesn't change past days. `nutrition_goals` is one row of daily goals.
- AI agents log food, set goals and save meal nutrition with the same data (see below).
- `supabase/migrations/*_nutrition.sql` (run after `supabase/migrations/*_agent_guide.sql`) adds the columns, tables, policies, `get_nutrition()` and `meals_agent_nutrition()`.

## Fitness
The **Fitness** tab tracks gym days: this week against a days-per-week goal with streaks, today's planned routine with one-tap ✓ done / ✗ skipped / rest, a month calendar of ticks and crosses, the workout plan (routines with weekdays and exercises), recent workouts and body weight.

- A planned gym day (`fitness_goals.gym_days`) that passes with nothing logged shows a cross, counted from the first workout ever logged; a logged rest day doesn't. The same rules are in `src/lib/fitness.js` (`buildCalendar`) and `meals_fitness_day_status()`.
- `workout_log` (done / skipped / rest, with the exercises actually done), `workout_routines` (the plan), `fitness_goals` (one row; `weight_unit` applies to every weight) and `body_log` (one weigh-in per day).
- Home shows this week's ticks and today's plan; agents log workouts, build the plan and coach from food + training + pantry together (`docs/MEALS_AGENT.md` §9–§11).
- `supabase/migrations/*_fitness.sql` (run after `supabase/migrations/*_nutrition.sql`) adds the tables, policies, `get_fitness()`, `meals_agent_fitness()`, `meals_agent_set_about_me()` and snapshot v3 (the v2 function is renamed `meals_kitchen_snapshot_v2` and wrapped). If you re-run `supabase/migrations/*_agent_write.sql`, re-run `supabase/migrations/*_fitness.sql` after it.

## Supplements
The **Nutrition** tab has a **Supplements** card: each supplement with its dose, when it's taken (morning / midday / evening / bedtime, or any time), whether it's part of the routine, being tried or paused, why it's taken and notes on how to take it. Tick each dose off through the day; tap one to edit it.

- `supplements` (one row each; `times` is the schedule, empty = any time) and `supplement_log` (one row per dose ticked: supplement, day, time slot).
- Agents add, change, pause and remove supplements, add notes and tick doses off (`save_supplement`, `delete_supplement`, `log_supplement`; `get_supplements` to read; `docs/MEALS_AGENT.md` §13). The snapshot (v4) includes them.
- `supabase/migrations/*_supplements.sql` (run after `supabase/migrations/*_fitness.sql`) adds the tables, policies, `get_supplements()`, `meals_agent_supplements()` and snapshot v4 (v3 is renamed `meals_kitchen_snapshot_v3` and wrapped), and adds omega-3, vitamin D (morning) and magnesium (bedtime) the first time. If you re-run `supabase/migrations/*_fitness.sql`, re-run `supabase/migrations/*_supplements.sql` after it.

## AI agent access
Any AI assistant can read everything (profile, meals and their readiness, pantry, grocery list, favorites, calories and macros, workouts and weight, supplements) and, with a key that has **Can make changes** on, update it, log food and workouts and build the workout plan. Managed in the app: **profile picture → AI Access**.

- **About me**: the owner's profile agents read first (body, goals, diet, training, household, tastes). Stored in `meals_profile`; write-enabled agents keep it current with `update_about_me`.
- **Share with any AI**: copy or download the guide + a snapshot (profile, kitchen, nutrition, fitness, supplements) as one Markdown document; paste it into any chat.
- **Connect an agent**: create a named, revocable key (read-only unless you turn on **Can make changes**, also switchable per key later). Add `https://<your-app>.vercel.app/api/mcp?key=<key>` as a custom connector (MCP) in Claude, ChatGPT, Gemini or any MCP client.
- **Agent guide**: **Open guide** shows the whole guide agents read, scrollable and editable (`src/components/GuideEditor.jsx`); when it has been edited, a second view shows the built-in `docs/MEALS_AGENT.md` to compare with. Write-enabled agents can edit it too (`update_kitchen_guide`); **Reset guide** goes back to the built-in one. Saving refuses to overwrite an edit an agent made in the meantime.
- **Recent agent changes**: everything agents changed, newest first.

Pieces:
- `supabase/migrations/*_agent_access.sql`: `get_kitchen_snapshot()` (one JSON document), `meals_agent_tokens` (only a SHA-256 hash of each key is stored) and the create/list/revoke RPCs, `meals_profile`.
- `supabase/migrations/*_agent_write.sql` (run after `supabase/migrations/*_agent_access.sql`): `meals_agent_tokens.can_write`, `meals_agent_write()` (the single write entry point; it applies the same sync rules as `useKitchen.js`), the `meals_agent_actions` audit log, snapshot v2.
- `supabase/migrations/*_agent_guide.sql` (run after `supabase/migrations/*_agent_write.sql`): `meals_agent_guide` (the edited guide; null = built-in), `get_meals_agent_guide()` and `meals_agent_set_guide()` (write keys only, logged as `update_kitchen_guide`).
- `api/mcp.js`: stateless MCP server (read tools `get_kitchen_guide`, `get_kitchen_snapshot`, `get_nutrition`, `get_fitness`, `get_supplements`; write tools `set_stock`, `add_to_grocery_list`, `create_meal`, …, `update_kitchen_guide`, `log_food`, `set_nutrition_goals`, `set_meal_nutrition`, `log_workout`, `set_fitness_goals`, `save_routine`, `log_body`, `save_supplement`, `log_supplement`, `update_about_me`, …; see `WRITE_ACTIONS`, `NUTRITION_ACTIONS`, `FITNESS_ACTIONS`, `SUPPLEMENT_ACTIONS`, `updateGuide` and `updateAboutMe` in `api/_lib/meals.js`). `api/agent/snapshot.js`, `api/agent/guide.js`, `api/agent/nutrition.js`, `api/agent/fitness.js`, `api/agent/supplements.js` (GET) and `api/agent/write.js` (POST): the same over plain HTTP (`?key=` or `Authorization: Bearer`).
- `docs/MEALS_AGENT.md`: the built-in guide agents read (field meanings, readiness rules, how to answer), used until someone edits it. Keep it in sync with the snapshot.
- `.claude/skills/meals-assistant`: lets Claude Code answer kitchen questions through the Supabase MCP.

The Vercel functions reuse `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no secret key is needed because the RPC checks the agent key itself.

## App structure

Seven tabs (Home, Meals, Pantry, Groceries, Favorites, Nutrition, Fitness), iOS-style (bottom tab bar on phones, sidebar on iPad/desktop), light & dark mode:

- **Meals**: every meal sorted by readiness: *Ready to cook*, *Almost there* (missing 1-2 essentials), *Waiting on groceries*, *Needs shopping*. Tap a meal for its ingredients, tap a circle to fix pantry status, add what's missing to the list in one tap, favorite/edit/delete.
- **Pantry**: grouped by aisle, tap the circle to toggle in stock, aisle filters, *Out* filter with one-tap *Restock*, *Select* for bulk actions.
- **Groceries**: quick add at the top, grouped by aisle, progress bar, meals you're shopping for. Picking an item up marks it in stock.
- **Favorites**: dishes and restaurants grouped by cuisine, with optional custom tags shown on each card (e.g. "South Indian" under Indian), with rating, place, notes, and an optional link to one of your meals (shows if it's ready to cook).

### Code layout
- `src/lib/useKitchen.js`: single data store for all tabs; loads everything once, versioned refreshes, all mutations
- `src/lib/kitchen.js`: pure helpers (meal readiness, unlock suggestions)
- `src/lib/useUndo.js` + `components/UndoToast.jsx`: one app-wide undo
- `src/components/ui.jsx`: Apple-style primitives (sheets, action sheets, grouped lists, segmented controls)
- `src/components/{Meals,Pantry,Groceries,Favorites}Tab.jsx`, `MealEditor.jsx`
- Design tokens live in `src/index.css` (iOS system colors for light/dark)

### Staying in sync
- Marking something in stock (Pantry or a meal) removes it from the grocery list; marking it out of stock clears a stale "picked up" entry.
- Removing an ingredient from a meal, or deleting a meal, drops its unbought grocery items.
- Data reloads whenever the app comes back to the foreground, so changes from another device show up.

### Undo behavior
- Grocery list removals (single item, a meal's items, clear picked up, clear all) delete immediately; Undo re-inserts them.
- Meal / pantry item deletes are hidden right away and committed after the 5s undo window (or when another undoable action happens / the page closes).

## Core data model
Tables: `ingredients`, `pantry`, `ingredient_categories`, `shopping_cart`, `meals`, `meal_ingredients`, `meal_categories`, `favorites` (see `supabase/migrations/*_favorites.sql`), plus `meals_profile`, `meals_agent_tokens`, `meals_agent_actions` and `meals_agent_guide` for AI access (see `supabase/migrations/*_agent_access.sql`, `supabase/migrations/*_agent_write.sql` and `supabase/migrations/*_agent_guide.sql`), `food_log` / `nutrition_goals` (plus `meals.calories` … `fiber`) for nutrition (`supabase/migrations/*_nutrition.sql`), `workout_log`, `workout_routines`, `fitness_goals` and `body_log` for fitness (`supabase/migrations/*_fitness.sql`), and `supplements` / `supplement_log` for supplements (`supabase/migrations/*_supplements.sql`).

`shopping_cart` uses a composite unique constraint on `(ingredient_id, meal_id)`.

## Quick validation checklist
1. `npm run lint` and `npm run build`
2. Add a meal with new + existing ingredients; edit it
3. Toggle pantry stock; bulk select; restock
4. Add from a meal to Groceries, pick up items, Clear all (one tap) and Undo
5. Add / edit / remove a favorite; favorite a meal from its detail sheet
6. AI Access: save About me, Copy guide + snapshot, create a key and POST `initialize` to `/api/mcp?key=…`, revoke it
7. With a write-enabled key: `set_stock` something, check it in the Pantry tab and under Recent agent changes; a read-only key gets refused
8. `update_kitchen_guide` with `append`, then `get_kitchen_guide` shows it; AI Access shows "Guide edited" and Reset guide restores the built-in one
9. Nutrition: set goals, log a custom food and a saved meal, edit / delete an entry and Undo; `log_food` from an agent shows up after refocusing the app
10. Fitness: set gym days and a weekly goal, add a routine, tick today done, mark a past day skipped and rest, check the calendar and Home; `log_workout` and `update_about_me` from an agent show up after refocusing the app
11. Supplements: tick a morning dose, add one with two times (two ticks), pause one (moves to Paused), remove one and Undo; `log_supplement` with `time: "morning"` from an agent shows up after refocusing the app

## Security notes (Supabase advisors)
A fresh install passes Supabase's security and performance advisors apart from these notices, which are expected:
- **RLS enabled, no policy** on `meals_agent_tokens`, `meals_agent_actions`, `meals_allowlist`, `meals_settings`: deny-all on purpose; only `SECURITY DEFINER` functions read them.
- **anon / authenticated can execute SECURITY DEFINER function** for the agent RPCs (`get_kitchen_snapshot`, `meals_agent_write`, `get_nutrition`, …) and the signed-in key management RPCs: this is the API. Each function checks a valid agent key (and `can_write` for writes) or a signed-in allowlisted member before touching data. Checked on a real project: a fake key, no key, and anonymous table reads all get nothing.
- **Unused index** on a new project: goes away with use.
