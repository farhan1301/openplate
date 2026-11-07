/**
 * GET /api/agent/nutrition?key=…&from=2026-10-01&to=2026-10-24 → calorie and
 * macro goals, day-by-day totals and entries, and each saved meal's
 * nutrition per serving. Without from/to: today. Log food and change goals
 * with POST /api/agent/write (log_food, set_nutrition_goals, …).
 */
import { getNutrition, keyedEndpoint } from '../_lib/meals.js'

export default keyedEndpoint(async (req, res, key) => {
  res.status(200).json(await getNutrition(key, { from: req.query?.from, to: req.query?.to }))
})
