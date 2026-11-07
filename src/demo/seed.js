// Sample data for demo mode (VITE_DEMO=true). Made up, and dated relative to
// today so the charts, streaks and calendar always look lived-in.

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const stamp = (n, hour = 12) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const weekdayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return WEEKDAY[d.getDay()] }

let counter = 0
export const newId = () => {
  counter += 1
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

export function buildSeed() {
  counter = 0
  const aisles = [
    ['Produce', '🥦'], ['Meat & Seafood', '🥩'], ['Dairy & Eggs', '🥛'], ['Bakery & Bread', '🍞'],
    ['Pantry & Dry Goods', '🫙'], ['Spices & Herbs', '🧂'], ['Canned & Jarred', '🥫'], ['Oils & Vinegars', '🫒'],
    ['Frozen Foods', '🧊'], ['Condiments', '🧴'], ['Beverages', '🧃'], ['Other', '🛒'],
  ].map(([name, icon], i) => ({ id: newId(), name, icon, sort_order: i + 1, created_at: stamp(60) }))
  const aisle = Object.fromEntries(aisles.map(a => [a.name, a.id]))

  const mealCategories = [
    ['Breakfast', '#f59e0b'], ['Lunch', '#3b82f6'], ['Dinner', '#8b5cf6'], ['Quick Meal', '#10b981'],
    ['Comfort Food', '#ef4444'], ['Healthy', '#22c55e'], ['Grilled', '#f97316'], ['Rice & Grains', '#eab308'],
    ['Pasta & Noodles', '#a78bfa'], ['Soups & Stews', '#06b6d4'], ['Salads', '#84cc16'], ['Snack', '#ec4899'],
  ].map(([name, color]) => ({ id: newId(), name, color, created_at: stamp(60) }))
  const category = Object.fromEntries(mealCategories.map(c => [c.name, c.id]))

  // name, aisle, in stock? (null = not tracked in the pantry)
  const ingredientList = [
    ['Eggs', 'Dairy & Eggs', true], ['Greek yogurt', 'Dairy & Eggs', true], ['Milk', 'Dairy & Eggs', true],
    ['Feta', 'Dairy & Eggs', false], ['Parmesan', 'Dairy & Eggs', true], ['Butter', 'Dairy & Eggs', true],
    ['Chicken breast', 'Meat & Seafood', true], ['Salmon fillet', 'Meat & Seafood', false], ['Ground turkey', 'Meat & Seafood', true],
    ['Spinach', 'Produce', true], ['Tomatoes', 'Produce', true], ['Onion', 'Produce', true], ['Garlic', 'Produce', true],
    ['Bell pepper', 'Produce', false], ['Avocado', 'Produce', false], ['Lemon', 'Produce', true], ['Banana', 'Produce', true],
    ['Broccoli', 'Produce', true], ['Cucumber', 'Produce', false], ['Sweet potato', 'Produce', true], ['Berries', 'Frozen Foods', true],
    ['Rolled oats', 'Pantry & Dry Goods', true], ['Brown rice', 'Pantry & Dry Goods', true], ['Spaghetti', 'Pantry & Dry Goods', true],
    ['Red lentils', 'Pantry & Dry Goods', true], ['Chickpeas', 'Canned & Jarred', true], ['Crushed tomatoes', 'Canned & Jarred', false],
    ['Coconut milk', 'Canned & Jarred', true], ['Whole-wheat tortillas', 'Bakery & Bread', true], ['Sourdough', 'Bakery & Bread', false],
    ['Olive oil', 'Oils & Vinegars', true], ['Soy sauce', 'Condiments', true], ['Peanut butter', 'Condiments', true], ['Honey', 'Condiments', true],
    ['Cumin', 'Spices & Herbs', true], ['Curry powder', 'Spices & Herbs', true], ['Chili flakes', 'Spices & Herbs', true], ['Basil', 'Spices & Herbs', false],
    ['Frozen peas', 'Frozen Foods', true], ['Chia seeds', 'Pantry & Dry Goods', false],
  ]
  const ingredients = ingredientList.map(([name, aisleName]) => ({ id: newId(), name, ingredient_category_id: aisle[aisleName], created_at: stamp(40) }))
  const ing = Object.fromEntries(ingredients.map(i => [i.name, i.id]))
  const pantry = ingredientList
    .filter(([, , inStock]) => inStock !== null)
    .map(([name, , inStock]) => ({ id: newId(), ingredient_id: ing[name], in_stock: inStock, updated_at: stamp(2) }))

  // name, category, minutes, description, nutrition per serving, [ingredient, quantity, optional]
  const mealList = [
    ['Spinach & feta omelette', 'Breakfast', 10, 'Three eggs, a handful of spinach, crumbled feta.', [320, 24, 4, 23, 2],
      [['Eggs', '3'], ['Spinach', '1 cup'], ['Feta', '30 g', true], ['Butter', '1 tsp']]],
    ['Overnight oats', 'Breakfast', 5, 'Make the night before. Top with berries.', [410, 22, 58, 10, 8],
      [['Rolled oats', '1/2 cup'], ['Greek yogurt', '1/2 cup'], ['Milk', '1/2 cup'], ['Berries', '1/2 cup'], ['Chia seeds', '1 tbsp', true], ['Honey', '1 tsp', true]]],
    ['Chicken burrito bowl', 'Lunch', 25, 'Meal-prep friendly. Makes 3 bowls.', [560, 42, 62, 14, 9],
      [['Chicken breast', '450 g'], ['Brown rice', '1 cup'], ['Bell pepper', '1'], ['Onion', '1'], ['Avocado', '1', true], ['Cumin', '1 tsp'], ['Lemon', '1']]],
    ['Red lentil dal', 'Soups & Stews', 30, 'Cheap, filling and freezes well.', [380, 20, 52, 9, 12],
      [['Red lentils', '1 cup'], ['Onion', '1'], ['Garlic', '3 cloves'], ['Tomatoes', '2'], ['Curry powder', '1 tbsp'], ['Coconut milk', '1/2 can', true]]],
    ['Garlic butter salmon & broccoli', 'Dinner', 20, 'One tray, 15 minutes in the oven.', [520, 38, 14, 34, 5],
      [['Salmon fillet', '2'], ['Broccoli', '1 head'], ['Garlic', '2 cloves'], ['Butter', '1 tbsp'], ['Lemon', '1']]],
    ['Turkey bolognese', 'Pasta & Noodles', 35, 'Leaner than beef, same comfort.', [610, 41, 72, 15, 8],
      [['Ground turkey', '450 g'], ['Spaghetti', '250 g'], ['Crushed tomatoes', '1 can'], ['Onion', '1'], ['Garlic', '3 cloves'], ['Parmesan', 'to serve', true], ['Basil', 'a few leaves', true]]],
    ['Chickpea & spinach curry', 'Dinner', 25, 'Pantry dinner when the fridge is empty.', [450, 17, 54, 18, 13],
      [['Chickpeas', '1 can'], ['Spinach', '2 cups'], ['Coconut milk', '1 can'], ['Onion', '1'], ['Curry powder', '1 tbsp'], ['Brown rice', '1 cup', true]]],
    ['Greek chicken wraps', 'Quick Meal', 15, 'Leftover chicken, tzatziki-style yogurt sauce.', [480, 39, 40, 16, 6],
      [['Whole-wheat tortillas', '2'], ['Chicken breast', '200 g'], ['Greek yogurt', '1/4 cup'], ['Cucumber', '1/2'], ['Tomatoes', '1'], ['Feta', '20 g', true]]],
    ['Peanut butter banana toast', 'Snack', 5, 'Pre-workout fuel.', [350, 12, 44, 15, 6],
      [['Sourdough', '1 slice'], ['Peanut butter', '1.5 tbsp'], ['Banana', '1'], ['Honey', 'drizzle', true]]],
    ['Sweet potato & egg hash', 'Healthy', 25, 'Crispy sweet potato, runny eggs.', [430, 19, 46, 18, 7],
      [['Sweet potato', '1 large'], ['Eggs', '2'], ['Onion', '1/2'], ['Bell pepper', '1/2', true], ['Chili flakes', 'pinch'], ['Olive oil', '1 tbsp']]],
  ]
  const meals = []
  const mealIngredients = []
  for (const [name, cat, minutes, description, [calories, protein, carbs, fat, fiber], items] of mealList) {
    const meal = { id: newId(), name, description, meal_category_id: category[cat], prep_time_minutes: minutes, image_url: null, calories, protein, carbs, fat, fiber, created_at: stamp(30) }
    meals.push(meal)
    for (const [ingredientName, quantity, optional] of items) {
      mealIngredients.push({ id: newId(), meal_id: meal.id, ingredient_id: ing[ingredientName], quantity, optional: Boolean(optional), created_at: stamp(30) })
    }
  }
  const meal = Object.fromEntries(meals.map(m => [m.name, m.id]))

  const shoppingCart = [
    ['Salmon fillet', 'Garlic butter salmon & broccoli', false], ['Bell pepper', 'Chicken burrito bowl', false],
    ['Avocado', null, false], ['Crushed tomatoes', 'Turkey bolognese', true], ['Cucumber', null, false], ['Feta', null, false],
  ].map(([name, mealName, checked], i) => ({ id: newId(), ingredient_id: ing[name], meal_id: mealName ? meal[mealName] : null, checked, added_at: stamp(1, 9 + i) }))

  const favorites = [
    ['dish', 'Chicken burrito bowl', 'Mexican', 'Home', null, 5, 'Best meal-prep lunch so far.', meal['Chicken burrito bowl'], ['Meal prep']],
    ['restaurant', 'Little Saigon Kitchen', 'Vietnamese', null, 'Downtown', 5, 'Get the lemongrass chicken vermicelli.', null, ['Pho']],
    ['restaurant', 'Napoli Wood Fire', 'Italian', null, 'Riverside', 4, 'Margherita is the move. Busy on Fridays.', null, ['Pizza']],
    ['dish', 'Butter chicken', 'Indian', 'Spice Route', null, 5, 'Mild, ask for extra naan.', null, ['North Indian']],
    ['dish', 'Salmon poke bowl', 'Japanese', 'Poke Bar', null, 4, 'High protein lunch out.', null, ['Hawaiian']],
    ['restaurant', 'Green Fork', 'Healthy', null, 'Midtown', 4, 'Good salads when eating out with the team.', null, []],
  ].map(([kind, name, cuisine, place, location, rating, notes, mealId, tags], i) => ({ id: newId(), kind, name, cuisine, place, location, rating, notes, meal_id: mealId, tags, image_url: null, created_at: stamp(20 - i) }))

  const nutritionGoals = { id: 1, calories: 2200, protein: 150, carbs: 220, fat: 70, fiber: 30, updated_at: stamp(10), updated_by: 'Claude' }

  // Food log: the last 6 days in full, today up to lunch.
  const day = [
    ['breakfast', 'Overnight oats', 410, 22, 58, 10, 8, meal['Overnight oats']],
    ['lunch', 'Chicken burrito bowl', 560, 42, 62, 14, 9, meal['Chicken burrito bowl']],
    ['snack', 'Greek yogurt with honey', 180, 17, 20, 3, 0, null],
    ['dinner', 'Chickpea & spinach curry', 450, 17, 54, 18, 13, meal['Chickpea & spinach curry']],
    ['snack', 'Apple and almonds', 260, 7, 28, 15, 6, null],
  ]
  const variants = [
    ['dinner', 'Turkey bolognese', 610, 41, 72, 15, 8, meal['Turkey bolognese']],
    ['dinner', 'Garlic butter salmon & broccoli', 520, 38, 14, 34, 5, meal['Garlic butter salmon & broccoli']],
    ['lunch', 'Greek chicken wraps', 480, 39, 40, 16, 6, meal['Greek chicken wraps']],
    ['breakfast', 'Spinach & feta omelette', 320, 24, 4, 23, 2, meal['Spinach & feta omelette']],
    ['dinner', 'Red lentil dal', 380, 20, 52, 9, 12, meal['Red lentil dal']],
    ['snack', 'Protein shake', 160, 30, 6, 2, 1, null],
  ]
  const foodLog = []
  for (let n = 6; n >= 0; n -= 1) {
    let entries = day.map((e, i) => (i === (n % 4) ? variants[n % variants.length] : e))
    if (n === 0) entries = entries.slice(0, 3)
    if (n === 2) entries = [...entries, ['snack', 'Dark chocolate', 170, 2, 13, 12, 3, null]]
    entries.forEach(([slot, name, calories, protein, carbs, fat, fiber, mealId], i) => {
      foodLog.push({ id: newId(), eaten_on: daysAgo(n), slot, name, meal_id: mealId, servings: 1, calories, protein, carbs, fat, fiber, notes: null, logged_by: i % 2 ? 'App' : 'Claude', created_at: stamp(n, 8 + i * 3) })
    })
  }

  const fitnessGoals = { id: 1, days_per_week: 4, gym_days: ['mon', 'tue', 'thu', 'sat'], session_minutes: 60, weight_unit: 'kg', target_weight: 72, focus: 'Build strength, lose a little fat', updated_at: stamp(14), updated_by: 'Claude' }
  const ex = (name, sets, reps, weight) => ({ name, sets, reps, weight })
  const routineList = [
    ['Push', ['mon'], 'Chest, shoulders, triceps', [ex('Bench press', 4, '6-8', 60), ex('Overhead press', 3, '8', 35), ex('Incline dumbbell press', 3, '10', 22), ex('Triceps pushdown', 3, '12', 25)]],
    ['Pull', ['tue'], 'Back and biceps', [ex('Deadlift', 3, '5', 100), ex('Pull-ups', 4, '6-8', null), ex('Barbell row', 3, '8', 55), ex('Hammer curl', 3, '12', 14)]],
    ['Legs', ['thu'], 'Quads, hamstrings, glutes', [ex('Back squat', 4, '6', 80), ex('Romanian deadlift', 3, '8', 70), ex('Walking lunges', 3, '12', 16), ex('Calf raises', 4, '15', 40)]],
    ['Full body', ['sat'], 'Lighter day plus conditioning', [ex('Goblet squat', 3, '10', 24), ex('Push-ups', 3, '15', null), ex('Kettlebell swings', 4, '15', 20), ex('Plank', 3, '45 s', null)]],
  ]
  const workoutRoutines = routineList.map(([name, days, focus, exercises]) => ({ id: newId(), name, days, focus, exercises, notes: null, created_at: stamp(30), updated_at: stamp(14), updated_by: 'Claude' }))
  const routineFor = Object.fromEntries(workoutRoutines.flatMap(r => r.days.map(d => [d, r])))

  // Four weeks of training: planned days done, one skipped, one logged rest day.
  const workoutLog = []
  for (let n = 27; n >= 1; n -= 1) {
    const routine = routineFor[weekdayAgo(n)]
    if (!routine) continue
    const status = n === 16 ? 'skipped' : n === 9 ? 'rest' : 'done'
    workoutLog.push({
      id: newId(), done_on: daysAgo(n), status, title: status === 'rest' ? 'Rest day' : routine.name, routine_id: status === 'done' ? routine.id : null,
      kind: status === 'done' ? 'strength' : null, duration_minutes: status === 'done' ? 55 + (n % 3) * 5 : null, intensity: status === 'done' ? (n % 2 ? 'moderate' : 'hard') : null,
      calories_burned: null, exercises: status === 'done' ? routine.exercises : [], notes: status === 'skipped' ? 'Work trip' : null,
      logged_by: n % 3 ? 'App' : 'Claude', created_at: stamp(n, 19),
    })
  }
  workoutLog.push({ id: newId(), done_on: daysAgo(3), status: 'done', title: '5 km run', routine_id: null, kind: 'cardio', duration_minutes: 28, intensity: 'moderate', calories_burned: 320, exercises: [], notes: null, logged_by: 'Claude', created_at: stamp(3, 7) })

  const bodyLog = []
  for (let n = 56; n >= 0; n -= 7) {
    bodyLog.push({ id: newId(), measured_on: daysAgo(n), weight: Math.round((76.8 - (56 - n) * 0.045 + (n % 14 ? 0.2 : 0)) * 10) / 10, body_fat: null, notes: null, logged_by: 'App', created_at: stamp(n, 7) })
  }

  const supplements = [
    ['Vitamin D3', '2,000 IU', ['morning'], 'taking', 'Bones and immunity, little winter sun.', 'Take with breakfast; it\'s fat-soluble.'],
    ['Creatine', '5 g', ['morning'], 'taking', 'Strength and recovery.', 'Any time of day; consistency matters more than timing.'],
    ['Omega-3', '1 softgel', ['evening'], 'taking', 'Heart and joints.', 'With dinner to avoid fishy burps.'],
    ['Magnesium glycinate', '200 mg', ['bedtime'], 'trying', 'Sleep quality.', 'Trying for a month. 30–60 minutes before bed.'],
  ].map(([name, dose, times, status, purpose, notes]) => ({ id: newId(), name, dose, times, status, purpose, notes, started_on: status === 'trying' ? daysAgo(12) : daysAgo(90), created_at: stamp(90), updated_at: stamp(5), updated_by: 'Claude' }))
  const supplementLog = [0, 1, 2].flatMap(n => supplements
    .filter(s => n > 0 || s.times[0] === 'morning')
    .map(s => ({ id: newId(), supplement_id: s.id, taken_on: daysAgo(n), time: s.times[0], logged_by: 'App', created_at: stamp(n, 9) })))

  const profile = {
    id: 1,
    about_me: 'Demo profile. 32, 175 cm, about 75 kg. Goal: lose ~3 kg of fat while getting stronger. Eats most things, no shellfish. Gym 4×/week after work (push, pull, legs, full body), runs on weekends. Cooks for one, meal-preps lunches on Sunday, weeknight dinners 30 minutes max. Loves spicy food and anything with rice.',
    updated_at: stamp(4),
  }
  const guide = { id: 1, content: null, updated_at: null, updated_by: null }

  const agentKeys = [
    { id: 1, label: 'Claude', token_prefix: 'opa_3f9c1a', can_write: true, created_at: stamp(30), last_used_at: stamp(0, 12), revoked_at: null },
    { id: 2, label: 'ChatGPT', token_prefix: 'opa_b72e04', can_write: false, created_at: stamp(12), last_used_at: stamp(2, 20), revoked_at: null },
  ]
  const agentActions = [
    { id: 6, token_label: 'Claude', action: 'log_food', created_at: stamp(0, 12), result: { logged: { name: 'Chicken burrito bowl', calories: 560 } } },
    { id: 5, token_label: 'Claude', action: 'set_stock', created_at: stamp(1, 18), result: { ingredients: ['Eggs', 'Spinach', 'Chicken breast'], in_stock: true } },
    { id: 4, token_label: 'Claude', action: 'add_meal_to_grocery_list', created_at: stamp(1, 17), result: { meal: 'Garlic butter salmon & broccoli', added: ['Salmon fillet'] } },
    { id: 3, token_label: 'Claude', action: 'log_workout', created_at: stamp(3, 8), result: { logged: { title: '5 km run', status: 'done', date: daysAgo(3) } } },
    { id: 2, token_label: 'Claude', action: 'save_routine', created_at: stamp(14), result: { updated: { name: 'Legs' } } },
    { id: 1, token_label: 'Claude', action: 'set_nutrition_goals', created_at: stamp(10), result: { goals: { calories: 2200, protein: 150 } } },
  ]

  return {
    tables: {
      ingredient_categories: aisles,
      meal_categories: mealCategories,
      ingredients,
      pantry,
      shopping_cart: shoppingCart,
      meals,
      meal_ingredients: mealIngredients,
      favorites,
      meals_profile: [profile],
      meals_agent_guide: [guide],
      nutrition_goals: [nutritionGoals],
      food_log: foodLog,
      fitness_goals: [fitnessGoals],
      workout_routines: workoutRoutines,
      workout_log: workoutLog,
      body_log: bodyLog,
      supplements,
      supplement_log: supplementLog,
    },
    agentKeys,
    agentActions,
    today: daysAgo(0),
  }
}

// Column defaults, applied on insert (mirrors supabase/migrations).
export const DEFAULTS = {
  ingredient_categories: () => ({ icon: '🛒', sort_order: 99 }),
  meal_categories: () => ({ color: '#10b981' }),
  pantry: () => ({ in_stock: true, updated_at: new Date().toISOString() }),
  shopping_cart: () => ({ meal_id: null, checked: false, added_at: new Date().toISOString() }),
  meals: () => ({ description: null, meal_category_id: null, prep_time_minutes: null, image_url: null, calories: null, protein: null, carbs: null, fat: null, fiber: null }),
  meal_ingredients: () => ({ quantity: null, optional: false }),
  favorites: () => ({ tags: [], image_url: null, meal_id: null }),
  food_log: () => ({ eaten_on: daysAgo(0), slot: 'snack', servings: 1, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, notes: null, meal_id: null, logged_by: 'App' }),
  workout_log: () => ({ done_on: daysAgo(0), status: 'done', exercises: [], logged_by: 'App', routine_id: null, kind: null, duration_minutes: null, intensity: null, calories_burned: null, notes: null }),
  workout_routines: () => ({ days: [], exercises: [], updated_at: new Date().toISOString(), updated_by: 'App' }),
  body_log: () => ({ measured_on: daysAgo(0), logged_by: 'App', body_fat: null, notes: null }),
  supplements: () => ({ times: [], status: 'taking', updated_at: new Date().toISOString(), updated_by: 'App' }),
  supplement_log: () => ({ taken_on: daysAgo(0), time: 'any', logged_by: 'App' }),
}

// Unique keys that upsert's onConflict can target.
export const UNIQUE = {
  pantry: ['ingredient_id'],
  shopping_cart: ['ingredient_id', 'meal_id'],
  meal_ingredients: ['meal_id', 'ingredient_id'],
  body_log: ['measured_on'],
  supplement_log: ['supplement_id', 'taken_on', 'time'],
  ingredients: ['name'],
}
