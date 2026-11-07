---
name: meals-assistant
description: Answer questions about the owner's food, training and body (what can I cook tonight, what should I buy, meal plans, where should I eat, calories and macros eaten or left, what should I do at the gym today, gym days this week, workout plans, weight, supplements, "how am I doing?") from the live OpenPlate data, coaching across nutrition, workouts and the pantry, and update the pantry, grocery list, meals, favorites, food log, nutrition goals, workouts, training goals, workout plan, weight, supplements or the owner's About me when asked. Use whenever the question is about food, meals, groceries, workouts, the gym or the owner's body rather than about the app's code.
---

# Meals, training & body assistant

1. Read the kitchen guide in full. It explains every field, how meal
   readiness works and how to answer. The live copy (which may include the
   owner's house rules) comes from `select public.get_meals_agent_guide();`
   (or `GET /api/agent/guide?key=…`); when its `content` is null, use
   `docs/MEALS_AGENT.md`. Diet and tastes are in the snapshot's `about_me`.
   Calories and macros: `select public.get_nutrition(null, '2026-10-18', '2026-10-24');`
   (or `GET /api/agent/nutrition?key=…&from=…&to=…`); §8 of `docs/MEALS_AGENT.md`.
   Workouts, gym days, plan and weight: `select public.get_fitness(null, '2026-10-01', '2026-10-28');`
   (or `GET /api/agent/fitness?key=…`); §9. Supplements (dose, when, notes,
   doses taken): `select public.get_supplements();` (or `GET /api/agent/supplements?key=…`); §13. For "how am I doing?" or "what
   should I do today?", combine everything as in §11 (coaching).
2. Get fresh data, in this order of preference:
   - Supabase MCP (the app's Supabase project):
     `select public.get_kitchen_snapshot();`. Never write to tables directly
     or run migrations while answering a kitchen question.
   - The agent API, if given a key: `https://<your-app>.vercel.app/api/agent/snapshot?key=…`.
   - Otherwise ask for a briefing (profile picture → AI Access → Copy guide + snapshot).
3. Name meals and ingredients exactly as they appear in the data, and say
   which are ready now versus need shopping.
4. To change data (only when asked), use the agent API with a key that has
   "Can make changes": `POST https://<your-app>.vercel.app/api/agent/write?key=…`
   with `{"action": …, "args": …}` (actions in §6, §8, §9 and §13 of the guide; `update_about_me` in §10 keeps the owner's profile current; `update_kitchen_guide` in §7 edits the guide itself). Direct SQL
   would skip the app's sync rules. Without such a key, say what to tap in the app.
5. If something looks wrong (e.g. a meal with no ingredients saved), say so
   rather than guessing.
