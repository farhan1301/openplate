/**
 * GET /api/agent/fitness?key=…&from=2026-10-01&to=2026-10-28 → training
 * goals, the workout plan, a day-by-day calendar (done / missed / rest /
 * planned) with workouts, weekly counts, streaks and body weight. Without
 * from/to: the last 28 days. Log workouts and change goals with
 * POST /api/agent/write (log_workout, set_fitness_goals, save_routine, …).
 */
import { getFitness, keyedEndpoint } from '../_lib/meals.js'

export default keyedEndpoint(async (req, res, key) => {
  res.status(200).json(await getFitness(key, { from: req.query?.from, to: req.query?.to }))
})
