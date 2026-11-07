/**
 * POST /api/agent/write?key=…  body: { "action": "set_stock", "args": { … } }
 * Changes kitchen data. Only works with a key that has "Can make changes"
 * turned on. Actions and arguments: see WRITE_ACTIONS and updateGuide
 * (update_kitchen_guide) in _lib/meals.js and the "Making changes" section of
 * docs/MEALS_AGENT.md.
 */
import { agentWrite, keyedEndpoint } from '../_lib/meals.js'

export default keyedEndpoint(async (req, res, key) => {
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Body must be JSON.' }) }
  }
  const { action, args } = body || {}
  res.status(200).json(await agentWrite(key, action, args || {}))
}, 'POST')
