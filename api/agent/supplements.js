/**
 * GET /api/agent/supplements?key=…&from=2026-10-01&to=2026-10-28 → the
 * owner's supplements (dose, times, status, purpose, notes), today's
 * schedule with what's been taken, and doses taken vs due per day. Without
 * from/to: the last 14 days. Change them with POST /api/agent/write
 * (save_supplement, delete_supplement, log_supplement).
 */
import { getSupplements, keyedEndpoint } from '../_lib/meals.js'

export default keyedEndpoint(async (req, res, key) => {
  res.status(200).json(await getSupplements(key, { from: req.query?.from, to: req.query?.to }))
})
