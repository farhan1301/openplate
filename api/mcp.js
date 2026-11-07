/**
 * MCP server for AI agents: POST /api/mcp?key=…
 *
 * Implements the stateless subset of MCP's Streamable HTTP transport: each
 * POST carries one JSON-RPC message (or a batch) and gets a plain JSON reply,
 * with no sessions and no server-sent events. Tools:
 *   get_kitchen_guide     how to read the data and how to help
 *   update_kitchen_guide  edit that guide (write keys only)
 *   get_nutrition         calorie / macro goals, food log and daily totals
 *   log_food / set_nutrition_goals / set_meal_nutrition / …
 *                         calorie tracking writes (write keys only)
 *   get_fitness           workout goals, plan, gym calendar, streaks, body weight
 *   log_workout / set_fitness_goals / save_routine / log_body / …
 *                         training writes (write keys only)
 *   get_supplements       supplements (dose, when, notes) and doses taken
 *   save_supplement / delete_supplement / log_supplement
 *                         supplement writes (write keys only)
 *   update_about_me       edit the owner's profile (write keys only)
 *   get_kitchen_snapshot  everything at once: profile, meals with readiness,
 *                         pantry, grocery list, favorites, nutrition, fitness,
 *                         supplements
 *   set_stock / *_grocery_list / *_meal / *_favorite / *_ingredient …
 *                         writes; only for keys with "Can make changes"
 *
 * The agent key comes from `?key=` (for clients like claude.ai that only take
 * a URL) or `Authorization: Bearer`. Supabase checks it on every tool call.
 */
import { ABOUT_ACTION, agentWrite, FITNESS_ACTIONS, getAgentKey, getFitness, getGuideState, getNutrition, getSnapshot, getSupplements, NUTRITION_ACTIONS, setCommonHeaders, SUPPLEMENT_ACTIONS, updateGuide, WRITE_ACTIONS } from './_lib/meals.js'

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const TOOLS = [
  {
    name: 'get_kitchen_guide',
    title: 'Kitchen guide',
    description: 'Read this first. The guide to the owner\'s food, training and body data: what every snapshot field means (meal readiness, pantry vs grocery list, nutrition, workouts and gym days, supplements), the rules, how to coach (combining what was eaten, the pantry and the training plan), and how to make changes. The owner and agents can edit it with update_kitchen_guide, so it may include house rules beyond the defaults.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_kitchen_snapshot',
    title: 'Kitchen snapshot',
    description: 'Live snapshot of everything: the owner\'s "about me" profile (body, goals, diet, training, tastes), every saved meal with its ingredients and whether it is ready to cook right now, the pantry by aisle, the grocery list, favorite dishes and restaurants, nutrition (goals, today\'s food log and what\'s left, the last 7 days), fitness (gym-day goal, workout plan, today, this week, streaks, the last 14 days of workouts, body weight) and supplements (what the owner takes, dose, when, notes, today\'s schedule with what\'s been taken, the last 7 days). Call it at the start of every conversation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_nutrition',
    title: 'Calories & macros',
    description: 'Calorie and macro tracking: daily goals (calories in kcal; protein, carbs, fat, fiber in grams), each day\'s food log entries with totals and what\'s left of each goal, the daily average, and every saved meal\'s nutrition per serving. Defaults to today; pass from/to for a range (up to 93 days), e.g. the last 7 days for a weekly review.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First day, YYYY-MM-DD (app time zone). Default: today' },
        to: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: from, or today' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_fitness',
    title: 'Workouts & gym days',
    description: 'Workout tracking: goals (gym days per week, planned weekdays, session length, weight unit, target weight, focus), the workout plan (routines with their weekdays and exercises), a calendar with each day done / missed / rest / planned and its workouts (exercises, sets, reps, weights, minutes, calories burned), weekly counts against the goal, streaks and body weight. Defaults to the last 28 days; pass from/to (up to 186 days).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First day, YYYY-MM-DD (app time zone). Default: 27 days before to' },
        to: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: today' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_supplements',
    title: 'Supplements',
    description: 'The owner\'s supplements: each one\'s dose, times of day (morning, midday, evening, bedtime; empty = any time), status (taking, trying, paused), purpose and notes on how to take it; today\'s schedule with what\'s been taken and what\'s left; and day by day, the doses taken vs due. Defaults to the last 14 days; pass from/to (up to 186 days).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First day, YYYY-MM-DD (app time zone). Default: 13 days before to' },
        to: { type: 'string', description: 'Last day, YYYY-MM-DD. Default: today' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
]

const write = (props) => ({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...props })
// Plain JSON Schema only (no anyOf / type arrays) so every MCP client, Gemini included, accepts it.
const names = (description) => ({ type: 'array', items: { type: 'string' }, minItems: 1, description })
const mealIngredient = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    quantity: { type: 'string', description: 'Free text, e.g. "2 cups"' },
    optional: { type: 'boolean', description: 'Nice to have; never blocks the meal (default false)' },
    aisle: { type: 'string', description: 'Aisle for a new ingredient, e.g. "Produce"' },
  },
  required: ['name'],
  additionalProperties: false,
}
const favoriteFields = {
  kind: { type: 'string', enum: ['dish', 'restaurant'] },
  name: { type: 'string' },
  cuisine: { type: 'string', description: 'e.g. "Indian"' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Sub-cuisines or labels, e.g. ["South Indian"]' },
  place: { type: 'string', description: 'Dishes: where it was had (a restaurant, or "Home")' },
  location: { type: 'string', description: 'Area or address' },
  rating: { type: 'integer', minimum: 0, maximum: 5, description: '1 to 5; 0 clears it' },
  notes: { type: 'string' },
  meal: { type: 'string', description: 'Saved meal this dish is cooked as (name or id); "" unlinks' },
}

const nutrientFields = (what) => ({
  calories: { type: 'number', minimum: 0, description: `kcal ${what}` },
  protein: { type: 'number', minimum: 0, description: `Grams ${what}` },
  carbs: { type: 'number', minimum: 0, description: `Grams ${what}` },
  fat: { type: 'number', minimum: 0, description: `Grams ${what}` },
  fiber: { type: 'number', minimum: 0, description: `Grams ${what}` },
})
const logFields = {
  date: { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday" (app time zone). Default today' },
  meal_slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
  servings: { type: 'number', description: 'More than 0; default 1' },
  notes: { type: 'string' },
}

const NUTRITION_TOOLS = [
  {
    name: 'log_food',
    title: 'Log food',
    description: 'Logs something the owner ate. For a saved meal pass meal (name or id) and servings: its per-serving nutrition × servings is used unless you pass numbers. For anything else pass name and your best estimate of calories, protein, carbs, fat and fiber for the whole entry. Returns the entry and the day\'s totals and what\'s left of each goal.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What was eaten, e.g. "Greek yogurt with honey"' },
        meal: { type: 'string', description: 'Saved meal name or id, to log it and reuse its nutrition' },
        ...logFields,
        ...nutrientFields('for this whole entry'),
      },
      additionalProperties: false,
    },
    annotations: write({}),
  },
  {
    name: 'update_food_log',
    title: 'Edit a log entry',
    description: 'Changes a food log entry (ids are in get_nutrition). Changing servings alone scales every number; numbers you pass win.',
    inputSchema: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Entry id' },
        name: { type: 'string' },
        ...logFields,
        ...nutrientFields('for this whole entry'),
      },
      required: ['entry'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_food_log',
    title: 'Delete a log entry',
    description: 'Deletes a food log entry (id from get_nutrition). Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'Entry id' } },
      required: ['entry'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'set_nutrition_goals',
    title: 'Set daily goals',
    description: 'Sets daily goals. Only the ones passed change; 0 removes a goal. The app shows progress against them.',
    inputSchema: {
      type: 'object',
      properties: nutrientFields('per day'),
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'set_meal_nutrition',
    title: 'Save a meal\'s nutrition',
    description: 'Saves a saved meal\'s nutrition per serving, so logging it later fills in the numbers. Only the fields passed change.',
    inputSchema: {
      type: 'object',
      properties: {
        meal: { type: 'string', description: 'Meal name or id' },
        ...nutrientFields('per serving'),
      },
      required: ['meal'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
]

const weekdays = (description) => ({ type: 'array', items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }, description })
const exercise = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'e.g. "Bench press", "Treadmill run"' },
    sets: { type: 'integer', minimum: 0 },
    reps: { type: 'string', description: 'Free text: "8", "8-12", "AMRAP"' },
    weight: { type: 'number', minimum: 0, description: 'Per rep, in the goals\' weight_unit' },
    duration_minutes: { type: 'number', minimum: 0 },
    distance_km: { type: 'number', minimum: 0 },
    notes: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
}
const workoutFields = {
  date: { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday" (app time zone). Default today' },
  status: { type: 'string', enum: ['done', 'skipped', 'rest'], description: 'done (default): worked out. skipped: missed a gym day. rest: planned rest day' },
  title: { type: 'string', description: 'e.g. "Leg day", "5 km run". Default: the routine\'s name' },
  routine: { type: 'string', description: 'Saved routine (name or id) this follows; its exercises are copied in unless you pass exercises' },
  kind: { type: 'string', enum: ['strength', 'cardio', 'mobility', 'sport', 'other'] },
  duration_minutes: { type: 'integer', minimum: 0 },
  intensity: { type: 'string', enum: ['easy', 'moderate', 'hard'] },
  calories_burned: { type: 'number', minimum: 0, description: 'kcal, your estimate if not given' },
  exercises: { type: 'array', items: exercise, description: 'What was actually done' },
  notes: { type: 'string' },
}
const routineFields = {
  days: weekdays('Weekdays this routine is done on'),
  focus: { type: 'string', description: 'e.g. "Chest, shoulders, triceps"' },
  exercises: { type: 'array', items: exercise, description: 'The full list (replaces the old one)' },
  notes: { type: 'string' },
}

const FITNESS_TOOLS = [
  {
    name: 'log_workout',
    title: 'Log a workout',
    description: 'Logs a gym session or other workout (status done), a skipped gym day (skipped) or a rest day (rest). Pass routine to follow a saved routine (its exercises are copied in), and exercises with what was actually lifted or run. The app\'s calendar shows a tick for done and a cross for skipped. Returns the entry and this week against the gym-day goal.',
    inputSchema: { type: 'object', properties: workoutFields, additionalProperties: false },
    annotations: write({}),
  },
  {
    name: 'update_workout',
    title: 'Edit a workout',
    description: 'Changes a logged workout (ids are in get_fitness). Only the fields passed change; exercises replaces the whole list.',
    inputSchema: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'Workout id' }, ...workoutFields },
      required: ['entry'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_workout',
    title: 'Delete a workout',
    description: 'Deletes a logged workout (id from get_fitness). Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'Workout id' } },
      required: ['entry'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'set_fitness_goals',
    title: 'Set training goals',
    description: 'Sets training goals. Only the fields passed change; 0 or "" clears one. Planned gym_days drive the calendar: a past gym day with nothing logged shows as missed.',
    inputSchema: {
      type: 'object',
      properties: {
        days_per_week: { type: 'integer', minimum: 0, maximum: 7, description: 'Gym days to hit each Monday–Sunday week' },
        gym_days: weekdays('Planned gym weekdays, e.g. ["mon","tue","thu","fri"]; [] for none'),
        session_minutes: { type: 'integer', minimum: 0, description: 'Target session length' },
        weight_unit: { type: 'string', enum: ['kg', 'lb'], description: 'Unit for every weight (exercises and body)' },
        target_weight: { type: 'number', minimum: 0, description: 'Target body weight' },
        focus: { type: 'string', description: 'The training goal in words, e.g. "Lose fat, keep muscle; bench 225 by summer"' },
      },
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'save_routine',
    title: 'Save a workout routine',
    description: 'Creates or changes a routine in the workout plan (the exercises the owner should do, and on which weekdays). To change one pass routine (name or id) and the fields to change (name renames it); otherwise pass name and it\'s created, or updated if one with that exact name exists.',
    inputSchema: {
      type: 'object',
      properties: {
        routine: { type: 'string', description: 'Existing routine to change (name or id)' },
        name: { type: 'string', description: 'Name for a new routine, or the new name' },
        ...routineFields,
      },
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_routine',
    title: 'Delete a routine',
    description: 'Deletes a routine from the workout plan. Logged workouts keep their exercises. Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { routine: { type: 'string', description: 'Routine name or id' } },
      required: ['routine'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'log_body',
    title: 'Log weight',
    description: 'Records body weight (in the goals\' weight_unit) and/or body fat % for a day; one entry per day, so logging again that day updates it.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday". Default today' },
        weight: { type: 'number', minimum: 0 },
        body_fat: { type: 'number', minimum: 0, maximum: 99, description: 'Percent' },
        notes: { type: 'string' },
      },
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_body_log',
    title: 'Delete a weigh-in',
    description: 'Deletes the weight / body fat entry for a day. Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday"' } },
      required: ['date'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'update_about_me',
    title: 'Edit the owner\'s profile',
    description: 'Changes "About me" (the snapshot\'s about_me): the owner\'s own profile that every agent reads first, e.g. age, height, weight, goals, diet, allergies, injuries, training history, schedule and tastes. Pass exactly one of: find + replace (swap one exact passage), append (add a line or section), or content (replace it all). Keep it short and current; only change it when the owner tells you something about themselves or asks.',
    inputSchema: {
      type: 'object',
      properties: {
        find: { type: 'string', description: 'Text copied exactly from about_me; must appear once' },
        replace: { type: 'string', description: 'New text for find; "" deletes it' },
        append: { type: 'string', description: 'Markdown to add at the end' },
        content: { type: 'string', description: 'The whole new profile, in Markdown' },
      },
      additionalProperties: false,
    },
    annotations: write({}),
  },
]

const timesOfDay = ['morning', 'midday', 'evening', 'bedtime']

const SUPPLEMENT_TOOLS = [
  {
    name: 'save_supplement',
    title: 'Add or edit a supplement',
    description: 'Adds a supplement the owner takes or is trying, or changes one: dose, when to take it, status, why, and notes (how to take it: with food, spacing from other supplements, tips). To change one pass supplement (name or id) and the fields to change (name renames it); otherwise pass name and it\'s added, or updated if one with that exact name exists. Only the fields passed change; "" clears a text field. Stopping one for now: status "paused"; removing it: delete_supplement.',
    inputSchema: {
      type: 'object',
      properties: {
        supplement: { type: 'string', description: 'Existing supplement to change (name or id)' },
        name: { type: 'string', description: 'e.g. "Vitamin D3"; for a new one, or the new name' },
        dose: { type: 'string', description: 'How much, as on the label: "2,000 IU", "1 g EPA+DHA (2 softgels)", "200 mg glycinate"' },
        times: { type: 'array', items: { type: 'string', enum: timesOfDay }, description: 'When in the day, e.g. ["morning"] or ["morning","bedtime"] for twice a day; [] for any time. Replaces the old list' },
        status: { type: 'string', enum: ['taking', 'trying', 'paused'], description: 'taking (default): part of the routine. trying: a new one being tried out. paused: not taking for now (not due)' },
        purpose: { type: 'string', description: 'Why the owner takes it, e.g. "Sleep and recovery"' },
        notes: { type: 'string', description: 'How to take it and tips, e.g. "With breakfast; needs some fat to absorb"' },
        started_on: { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday"; "" clears it' },
      },
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_supplement',
    title: 'Remove a supplement',
    description: 'Removes a supplement and its history of doses taken. Only when the owner asks; to stop one for now, use save_supplement with status "paused".',
    inputSchema: {
      type: 'object',
      properties: { supplement: { type: 'string', description: 'Supplement name or id' } },
      required: ['supplement'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'log_supplement',
    title: 'Mark supplements taken',
    description: 'Ticks supplements off as taken (taken: false un-ticks them). "I took my morning supplements" → time "morning" alone ticks everything due then; "took my magnesium" → supplements ["Magnesium"] (its next dose not yet taken that day). Returns the day\'s doses taken vs due and what\'s left.',
    inputSchema: {
      type: 'object',
      properties: {
        supplements: names('Supplement name(s), as in the snapshot'),
        time: { type: 'string', enum: [...timesOfDay, 'any'], description: 'Which dose: everything due then if no supplements are named' },
        date: { type: 'string', description: 'YYYY-MM-DD, "today" or "yesterday" (app time zone). Default today' },
        taken: { type: 'boolean', description: 'Default true; false un-ticks' },
      },
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
]

const WRITE_TOOLS = [
  {
    name: 'update_kitchen_guide',
    title: 'Edit the kitchen guide',
    description: 'Changes the kitchen guide that get_kitchen_guide returns (Markdown): field definitions, rules, how to answer, house rules. Read the guide first. Pass exactly one of: find + replace (swap one exact passage, the usual way to edit), append (add a section at the end), content (replace the whole guide), or reset: true (go back to the built-in guide). Only change it when the owner asks; the previous text is kept in the change log.',
    inputSchema: {
      type: 'object',
      properties: {
        find: { type: 'string', description: 'Text copied exactly from the guide; must appear once' },
        replace: { type: 'string', description: 'New text for find; "" deletes it' },
        append: { type: 'string', description: 'Markdown to add at the end, e.g. a "## House rules" section' },
        content: { type: 'string', description: 'The whole new guide, in Markdown' },
        reset: { type: 'boolean', description: 'true: discard all edits and use the built-in guide' },
      },
      additionalProperties: false,
    },
    annotations: write({}),
  },
  {
    name: 'set_stock',
    title: 'Mark in / out of stock',
    description: 'Marks pantry ingredients in stock (default) or out of stock, e.g. after shopping or when something runs out. In stock also removes them from the grocery list; out of stock clears stale "picked up" rows. Returns what is ready to cook now.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredients: names('Ingredient name(s), as in the snapshot'),
        in_stock: { type: 'boolean', description: 'Default true' },
      },
      required: ['ingredients'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'add_ingredient',
    title: 'Add pantry ingredient',
    description: 'Adds an ingredient to the pantry (in stock by default). If it already exists, sets its stock instead.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        aisle: { type: 'string', description: 'One of the snapshot\'s aisles, e.g. "Produce"' },
        in_stock: { type: 'boolean', description: 'Default true' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'update_ingredient',
    title: 'Rename / move ingredient',
    description: 'Renames an ingredient or moves it to another aisle. Meals and the grocery list follow automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredient: { type: 'string', description: 'Current name' },
        name: { type: 'string', description: 'New name' },
        aisle: { type: 'string' },
      },
      required: ['ingredient'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_ingredient',
    title: 'Delete ingredient',
    description: 'Deletes an ingredient everywhere: pantry, grocery list and every meal that uses it. Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { ingredient: { type: 'string' } },
      required: ['ingredient'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'add_to_grocery_list',
    title: 'Add to grocery list',
    description: 'Adds items to the grocery list ("to buy"). Unknown names become new ingredients. Items already on the list are skipped.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredients: names('Item name(s)'),
        aisle: { type: 'string', description: 'Aisle for any new ingredients' },
        for_meal: { type: 'string', description: 'Saved meal these are for (optional)' },
      },
      required: ['ingredients'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'add_meal_to_grocery_list',
    title: 'Shop for a meal',
    description: 'Adds everything a saved meal is missing (not in stock, not already on the list) to the grocery list.',
    inputSchema: {
      type: 'object',
      properties: {
        meal: { type: 'string', description: 'Meal name or id' },
        include_optional: { type: 'boolean', description: 'Also add missing optional ingredients (default false)' },
      },
      required: ['meal'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'mark_picked_up',
    title: 'Mark picked up',
    description: 'Checks grocery list items off as bought (which also marks them in stock), or un-checks them with picked_up: false.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredients: names('Item name(s) on the grocery list'),
        picked_up: { type: 'boolean', description: 'Default true' },
      },
      required: ['ingredients'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'remove_from_grocery_list',
    title: 'Remove from grocery list',
    description: 'Removes items from the grocery list, or clears it: clear "picked_up" (bought items) or "all". Pass ingredients or clear, not both.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredients: names('Item name(s)'),
        clear: { type: 'string', enum: ['picked_up', 'all'] },
      },
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'create_meal',
    title: 'Save a new meal',
    description: 'Saves a new meal with its ingredients. New ingredients join the pantry as out of stock. Returns the meal with its readiness.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', description: 'One of the snapshot\'s meal_categories, e.g. "Dinner"' },
        prep_time_minutes: { type: 'integer', minimum: 0 },
        description: { type: 'string' },
        ingredients: { type: 'array', items: mealIngredient },
        allow_duplicate: { type: 'boolean', description: 'Save even if a meal with this name exists' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: write({}),
  },
  {
    name: 'update_meal',
    title: 'Edit a meal',
    description: 'Changes a saved meal: name, category, prep time, description; add or update ingredients (quantity, optional) and remove ingredients. Removing one also drops its unbought grocery rows for this meal.',
    inputSchema: {
      type: 'object',
      properties: {
        meal: { type: 'string', description: 'Meal name or id' },
        name: { type: 'string', description: 'New name' },
        category: { type: 'string', description: '"" clears it' },
        prep_time_minutes: { type: 'integer', minimum: 0, description: '0 clears it' },
        description: { type: 'string', description: '"" clears it' },
        add_ingredients: { type: 'array', items: mealIngredient },
        remove_ingredients: names('Ingredient name(s) to take out of this meal'),
      },
      required: ['meal'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_meal',
    title: 'Delete a meal',
    description: 'Deletes a saved meal and its unbought grocery rows. Ingredients stay in the pantry. Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { meal: { type: 'string', description: 'Meal name or id' } },
      required: ['meal'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
  {
    name: 'add_favorite',
    title: 'Add a favorite',
    description: 'Saves a favorite dish or restaurant.',
    inputSchema: {
      type: 'object',
      properties: { ...favoriteFields, allow_duplicate: { type: 'boolean' } },
      required: ['kind', 'name'],
      additionalProperties: false,
    },
    annotations: write({}),
  },
  {
    name: 'update_favorite',
    title: 'Edit a favorite',
    description: 'Changes a favorite dish or restaurant. Only the fields passed change; pass "" (or rating 0) to clear one.',
    inputSchema: {
      type: 'object',
      properties: { favorite: { type: 'string', description: 'Favorite name or id (ids are in the snapshot)' }, ...favoriteFields },
      required: ['favorite'],
      additionalProperties: false,
    },
    annotations: write({ idempotentHint: true }),
  },
  {
    name: 'delete_favorite',
    title: 'Delete a favorite',
    description: 'Deletes a favorite dish or restaurant. Only when the owner asks.',
    inputSchema: {
      type: 'object',
      properties: { favorite: { type: 'string', description: 'Favorite name or id' } },
      required: ['favorite'],
      additionalProperties: false,
    },
    annotations: write({ destructiveHint: true, idempotentHint: true }),
  },
]
TOOLS.push(...WRITE_TOOLS, ...NUTRITION_TOOLS, ...FITNESS_TOOLS, ...SUPPLEMENT_TOOLS)

const INSTRUCTIONS = 'One person\'s food, training and body: meals, pantry, grocery list, favorite dishes/restaurants, calorie and macro tracking, workouts and gym days, supplements, and their "About me" profile. At the start of a conversation call get_kitchen_guide once, then get_kitchen_snapshot (it has the profile, kitchen, today\'s nutrition, this week\'s training and today\'s supplements), before answering questions like "what can I cook tonight?", "what should I buy?", "what should I do at the gym today?" or "how am I doing?". Coach by combining them: what was eaten vs the goals, what the pantry can make, the workout plan and what was trained recently. If the key can make changes (snapshot access.can_write), you can also, when the owner asks, update the pantry, grocery list, meals and favorites; log food and set nutrition goals (log_food, set_nutrition_goals, …); log workouts, skipped and rest days, weight, training goals and the workout plan (log_workout, set_fitness_goals, save_routine, log_body, …); add, edit and remove supplements and tick off doses taken (save_supplement, delete_supplement, log_supplement); keep the owner\'s profile current (update_about_me); and edit the guide itself (update_kitchen_guide). Use names exactly as in the snapshot and say what you changed. After logging, tell the owner what is left for the day or the week.'

const callTool = async (name, args, key) => {
  switch (name) {
    case 'get_kitchen_guide': {
      const guide = await getGuideState(key)
      const edited = guide.customized
        ? `<!-- Edited${guide.updated_by ? ` by ${guide.updated_by}` : ''} on ${guide.updated_at}. update_kitchen_guide changes it; reset: true restores the built-in guide. -->\n\n`
        : ''
      return edited + guide.content
    }
    case 'update_kitchen_guide':
      return JSON.stringify(await updateGuide(key, args), null, 2)
    case 'get_kitchen_snapshot':
      return JSON.stringify(await getSnapshot(key), null, 2)
    case 'get_nutrition':
      return JSON.stringify(await getNutrition(key, args), null, 2)
    case 'get_fitness':
      return JSON.stringify(await getFitness(key, args), null, 2)
    case 'get_supplements':
      return JSON.stringify(await getSupplements(key, args), null, 2)
    default:
      if (!Object.hasOwn(WRITE_ACTIONS, name) && !Object.hasOwn(NUTRITION_ACTIONS, name) && !Object.hasOwn(FITNESS_ACTIONS, name) && !Object.hasOwn(SUPPLEMENT_ACTIONS, name) && name !== ABOUT_ACTION) return null
      return JSON.stringify(await agentWrite(key, name, args), null, 2)
  }
}

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** Handles one JSON-RPC message; returns null for notifications. */
const handleMessage = async (message, key) => {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message?.id, -32600, 'Invalid request')
  }
  const { id, method, params = {} } = message
  const isNotification = id === undefined

  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'openplate', title: "OpenPlate: food, training & body", version: '1.2.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })
    case 'tools/call': {
      try {
        const text = await callTool(params.name, params.arguments || {}, key)
        if (text == null) return rpcError(id, -32602, `Unknown tool: ${params.name}`)
        return rpcResult(id, { content: [{ type: 'text', text }] })
      } catch (err) {
        return rpcResult(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true })
      }
    }
    default:
      if (isNotification) return null
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

export default async function handler(req, res) {
  setCommonHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  // Stateless server: no SSE stream to open and no session to delete.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json(rpcError(null, -32000, 'Method not allowed. POST JSON-RPC messages to this URL.'))
  }

  const key = getAgentKey(req)
  if (!key) {
    return res.status(401).json(rpcError(null, -32001, 'Missing agent key. Add ?key=… to the URL or send Authorization: Bearer ….'))
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json(rpcError(null, -32700, 'Parse error')) }
  }

  const messages = Array.isArray(body) ? body : [body]
  const replies = (await Promise.all(messages.map(m => handleMessage(m, key)))).filter(Boolean)

  if (replies.length === 0) return res.status(202).end()
  return res.status(200).json(Array.isArray(body) ? replies : replies[0])
}
