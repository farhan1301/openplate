/** GET /api/agent/snapshot?key=… → the kitchen snapshot as JSON. */
import { getSnapshot, keyedEndpoint } from '../_lib/meals.js'

export default keyedEndpoint(async (req, res, key) => {
  res.status(200).json(await getSnapshot(key))
})
