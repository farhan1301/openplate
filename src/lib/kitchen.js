// Pure helpers shared by the tabs. No Supabase calls here.

export const normalizedName = (value) => (value ?? '').trim().toLowerCase()

export const byName = (a, b) => a.name.localeCompare(b.name)

const MEAL_CATEGORY_ORDER = ['Breakfast', 'Lunch', 'Lunch / Dinner', 'Dinner', 'Quick Meal', 'Snack', 'Dessert']

export function sortMealCategories(categories) {
  return [...categories].sort((a, b) => {
    const ai = MEAL_CATEGORY_ORDER.indexOf(a.name)
    const bi = MEAL_CATEGORY_ORDER.indexOf(b.name)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.name.localeCompare(b.name)
  })
}

/**
 * How close a meal is to being cookable.
 *  ready   — every essential ingredient is in stock
 *  listed  — everything still missing is already on the grocery list
 *  almost  — missing one or two essentials
 *  missing — missing three or more essentials
 *  empty   — no ingredients linked yet
 */
export function mealReadiness(meal, inStock, onList) {
  const links = (meal.meal_ingredients || []).filter(link => link.ingredient_id)
  const essentials = links.filter(link => !link.optional)
  const missingEssential = essentials.filter(link => !inStock.has(link.ingredient_id))
  const missingOptional = links.filter(link => link.optional && !inStock.has(link.ingredient_id))

  let status = 'missing'
  if (links.length === 0) status = 'empty'
  else if (missingEssential.length === 0) status = 'ready'
  else if (missingEssential.every(link => onList.has(link.ingredient_id))) status = 'listed'
  else if (missingEssential.length <= 2) status = 'almost'

  return {
    status,
    total: essentials.length,
    have: essentials.length - missingEssential.length,
    missingEssential,
    missingOptional,
    toBuy: missingEssential.filter(link => !onList.has(link.ingredient_id)),
    toBuyOptional: missingOptional.filter(link => !onList.has(link.ingredient_id)),
  }
}

export const STATUS_META = {
  ready: { label: 'Ready', color: 'green' },
  listed: { label: 'On list', color: 'tint' },
  almost: { label: 'Almost', color: 'orange' },
  missing: { label: 'Need items', color: 'red' },
  empty: { label: 'No ingredients', color: 'label-2' },
}

export const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`

export const COMMON_CUISINES = [
  'Indian', 'Pakistani', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai',
  'Middle Eastern', 'Mediterranean', 'Korean', 'American', 'Vietnamese', 'Turkish', 'French',
]
