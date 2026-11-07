/**
 * GET /api/agent/guide?key=… → the kitchen guide (how to read the data and
 * how to help): the edited copy if an agent or the owner changed it, else
 * docs/MEALS_AGENT.md. Needs a key so only connected agents see it. Change it
 * with POST /api/agent/write, action "update_kitchen_guide".
 */
import { getGuide, keyedEndpoint } from '../_lib/meals.js'

export default keyedEndpoint(async (req, res, key) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.status(200).send(await getGuide(key))
})
