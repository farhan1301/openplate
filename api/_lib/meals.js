/**
 * Shared helpers for the AI agent endpoints (api/mcp.js, api/agent/*).
 *
 * Every call goes through a Supabase RPC that checks the agent key itself
 * (get_kitchen_snapshot / meals_agent_write, get_meals_agent_guide /
 * meals_agent_set_guide, get_nutrition / meals_agent_nutrition,
 * get_fitness / meals_agent_fitness, get_supplements / meals_agent_supplements,
 * meals_agent_set_about_me), so these
 * functions only need the public URL and anon key, never a secret key. Writes only work for keys with
 * "Can make changes" turned on in the app.
 */
import fs from 'node:fs'
import path from 'node:path'

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

export class AgentError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.status = status
  }
}

/** The agent key from `Authorization: Bearer …` or `?key=…`. */
export const getAgentKey = (req) => {
  const auth = req.headers.authorization || ''
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim()
  const key = req.query?.key
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

const callRpc = async (fn, args) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new AgentError('Server is missing the Supabase URL or anon key.')
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const message = body?.message || `Supabase returned ${response.status}`
    const denied = body?.code === '42501' || response.status === 401 || response.status === 403
    const badInput = body?.code === '22023' || body?.code === '22P02'
    const err = new AgentError(message, denied ? 401 : badInput ? 400 : 502)
    err.code = body?.code
    throw err
  }
  return body
}

/** Every meal with readiness, the pantry, the grocery list and favorites. */
export const getSnapshot = (key) => callRpc('get_kitchen_snapshot', { p_token: key })

/** Write actions meals_agent_write accepts, with the arguments each one takes. */
export const WRITE_ACTIONS = {
  set_stock: ['ingredients', 'in_stock'],
  add_ingredient: ['name', 'aisle', 'in_stock'],
  update_ingredient: ['ingredient', 'name', 'aisle'],
  delete_ingredient: ['ingredient'],
  add_to_grocery_list: ['ingredients', 'aisle', 'for_meal'],
  add_meal_to_grocery_list: ['meal', 'include_optional'],
  mark_picked_up: ['ingredients', 'picked_up'],
  remove_from_grocery_list: ['ingredients', 'clear'],
  create_meal: ['name', 'category', 'prep_time_minutes', 'description', 'ingredients', 'allow_duplicate'],
  update_meal: ['meal', 'name', 'category', 'prep_time_minutes', 'description', 'add_ingredients', 'remove_ingredients'],
  delete_meal: ['meal'],
  add_favorite: ['kind', 'name', 'cuisine', 'tags', 'place', 'location', 'rating', 'notes', 'meal', 'allow_duplicate'],
  update_favorite: ['favorite', 'kind', 'name', 'cuisine', 'tags', 'place', 'location', 'rating', 'notes', 'meal'],
  delete_favorite: ['favorite'],
}

/** Write action for the kitchen guide itself (handled here, not by meals_agent_write). */
export const GUIDE_ACTION = 'update_kitchen_guide'

const nutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber']

/** Calorie and macro tracking actions, run by meals_agent_nutrition. */
export const NUTRITION_ACTIONS = {
  log_food: ['name', 'meal', 'date', 'meal_slot', 'servings', ...nutrients, 'notes'],
  update_food_log: ['entry', 'name', 'date', 'meal_slot', 'servings', ...nutrients, 'notes'],
  delete_food_log: ['entry'],
  set_nutrition_goals: nutrients,
  set_meal_nutrition: ['meal', ...nutrients],
}

const workoutFields = ['date', 'status', 'title', 'routine', 'kind', 'duration_minutes', 'intensity', 'calories_burned', 'exercises', 'notes']

/** Workouts, gym-day goals, the training plan and body weight, run by meals_agent_fitness. */
export const FITNESS_ACTIONS = {
  log_workout: workoutFields,
  update_workout: ['entry', ...workoutFields],
  delete_workout: ['entry'],
  set_fitness_goals: ['days_per_week', 'gym_days', 'session_minutes', 'weight_unit', 'target_weight', 'focus'],
  save_routine: ['routine', 'name', 'days', 'focus', 'exercises', 'notes'],
  delete_routine: ['routine'],
  log_body: ['date', 'weight', 'body_fat', 'notes'],
  delete_body_log: ['date'],
}

/** The owner's supplements (what, how much, when) and the doses taken, run by meals_agent_supplements. */
export const SUPPLEMENT_ACTIONS = {
  save_supplement: ['supplement', 'name', 'dose', 'times', 'status', 'purpose', 'notes', 'started_on'],
  delete_supplement: ['supplement'],
  log_supplement: ['supplements', 'supplement', 'time', 'date', 'taken'],
}

/** Write action for the owner's "About me" profile (handled here, like the guide). */
export const ABOUT_ACTION = 'update_about_me'

const pick = (args, allowed) => {
  const clean = {}
  for (const name of allowed) {
    if (args[name] !== undefined) clean[name] = args[name]
  }
  return clean
}

/** An optional YYYY-MM-DD range argument; null when absent. */
const rangeDay = (value, name) => {
  if (value == null || value === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AgentError(`${name} must look like 2026-10-24.`, 400)
  return value
}

/** Goals, day-by-day totals and entries from `from` to `to` (YYYY-MM-DD; default today). */
export const getNutrition = (key, { from, to } = {}) =>
  callRpc('get_nutrition', { p_token: key, p_from: rangeDay(from, 'from'), p_to: rangeDay(to, 'to') })

/** Training goals, plan, calendar (done / missed / rest / planned), streaks and body weight from `from` to `to` (default the last 28 days). */
export const getFitness = (key, { from, to } = {}) =>
  callRpc('get_fitness', { p_token: key, p_from: rangeDay(from, 'from'), p_to: rangeDay(to, 'to') })

/** Supplements, today's schedule with what's taken, and doses taken vs due per day from `from` to `to` (default the last 14 days). */
export const getSupplements = (key, { from, to } = {}) =>
  callRpc('get_supplements', { p_token: key, p_from: rangeDay(from, 'from'), p_to: rangeDay(to, 'to') })

/**
 * Runs one write action. Supabase checks that the key may write and validates
 * the arguments. Unknown arguments are dropped; an explicit null is kept so
 * fields like `meal` or `prep_time_minutes` can be cleared.
 */
export const agentWrite = (key, action, args = {}) => {
  if (action === GUIDE_ACTION) return updateGuide(key, args)
  if (action === ABOUT_ACTION) return updateAboutMe(key, args)
  if (Object.hasOwn(NUTRITION_ACTIONS, action)) {
    return callRpc('meals_agent_nutrition', { p_token: key, p_action: action, p_args: pick(args, NUTRITION_ACTIONS[action]) })
  }
  if (Object.hasOwn(FITNESS_ACTIONS, action)) {
    return callRpc('meals_agent_fitness', { p_token: key, p_action: action, p_args: pick(args, FITNESS_ACTIONS[action]) })
  }
  if (Object.hasOwn(SUPPLEMENT_ACTIONS, action)) {
    return callRpc('meals_agent_supplements', { p_token: key, p_action: action, p_args: pick(args, SUPPLEMENT_ACTIONS[action]) })
  }
  const allowed = Object.hasOwn(WRITE_ACTIONS, action) ? WRITE_ACTIONS[action] : null
  if (!allowed) throw new AgentError(`Unknown action "${action}". Use one of: ${[...Object.keys(WRITE_ACTIONS), ...Object.keys(NUTRITION_ACTIONS), ...Object.keys(FITNESS_ACTIONS), ...Object.keys(SUPPLEMENT_ACTIONS), GUIDE_ACTION, ABOUT_ACTION].join(', ')}.`, 400)
  return callRpc('meals_agent_write', { p_token: key, p_action: action, p_args: pick(args, allowed) })
}

let defaultGuide = null
/** docs/MEALS_AGENT.md: the built-in guide, used until an agent or the owner changes it. */
const getDefaultGuide = () => {
  if (defaultGuide == null) {
    defaultGuide = fs.readFileSync(path.join(process.cwd(), 'docs', 'MEALS_AGENT.md'), 'utf8')
  }
  return defaultGuide
}

/**
 * The kitchen guide agents read (how to read the data and how to help): the
 * owner's edited copy if there is one, else the built-in file. Checks the key.
 */
export const getGuideState = async (key) => {
  let stored
  try {
    stored = await callRpc('get_meals_agent_guide', { p_token: key })
  } catch (err) {
    // supabase/migrations/*_agent_guide.sql not run yet: check the key and serve the built-in guide.
    if (err.code !== 'PGRST202') throw err
    await getSnapshot(key)
    stored = null
  }
  return {
    content: stored?.content ?? getDefaultGuide(),
    customized: Boolean(stored?.customized),
    updated_at: stored?.updated_at ?? null,
    updated_by: stored?.updated_by ?? null,
  }
}

export const getGuide = async (key) => (await getGuideState(key)).content

const isText = (value) => typeof value === 'string'

/**
 * One Markdown edit: exactly one of `content` (replace it all), `find` +
 * `replace` (swap one exact passage), `append` (add to the end) or, where
 * allowed, `reset: true`. Returns { mode, next } (next null = reset).
 */
const editText = (current, args, { what, readTool, canReset }) => {
  const options = ['content', 'find', 'append', ...(canReset ? ['reset'] : [])]
  const modes = options.filter(name => args[name] !== undefined && args[name] !== false)
  if (modes.length !== 1) {
    throw new AgentError(`Pass exactly one of: content (replace all of ${what}), find + replace, append${canReset ? ', or reset: true' : ''}.`, 400)
  }
  const [mode] = modes
  if (mode === 'reset') return { mode, next: null }
  if (mode === 'content') {
    if (!isText(args.content) || (canReset && !args.content.trim())) throw new AgentError(`content must be all of ${what} as Markdown text.${canReset ? ' To go back to the built-in guide, pass reset: true.' : ''}`, 400)
    return { mode, next: args.content }
  }
  if (mode === 'append') {
    if (!isText(args.append) || !args.append.trim()) throw new AgentError('append must be non-empty Markdown text.', 400)
    return { mode, next: current.trim() ? `${current.trimEnd()}\n\n${args.append.trim()}\n` : `${args.append.trim()}\n` }
  }
  if (!isText(args.find) || !args.find) throw new AgentError(`find must be text copied exactly from ${what}.`, 400)
  if (!isText(args.replace)) throw new AgentError('Pass replace (the new text; "" deletes the passage) along with find.', 400)
  const count = current.split(args.find).length - 1
  if (count === 0) throw new AgentError(`find doesn't appear in ${what}. Copy it exactly (including spacing and punctuation) from ${readTool}.`, 400)
  if (count > 1) throw new AgentError(`find appears ${count} times in ${what}. Include more surrounding text so it matches once.`, 400)
  return { mode, next: current.replace(args.find, () => args.replace) }
}

/** Changes the guide (see editText; reset: true goes back to the built-in guide). Write-enabled keys only. */
export const updateGuide = async (key, args = {}) => {
  const current = await getGuideState(key)
  const { mode, next } = editText(current.content, args, { what: 'the guide', readTool: 'get_kitchen_guide', canReset: true })
  const result = await callRpc('meals_agent_set_guide', { p_token: key, p_content: next, p_base_updated_at: current.updated_at })
  return { mode, ...result }
}

/**
 * Changes the owner's "About me" profile (body stats, goals, diet, training,
 * tastes) that the snapshot returns as about_me. Same edit modes as the
 * guide, without reset. Write-enabled keys only.
 */
export const updateAboutMe = async (key, args = {}) => {
  const snapshot = await getSnapshot(key)
  const { mode, next } = editText(snapshot.about_me || '', args, { what: 'About me', readTool: 'get_kitchen_snapshot (about_me)', canReset: false })
  const result = await callRpc('meals_agent_set_about_me', { p_token: key, p_content: next, p_base_updated_at: snapshot.about_me_updated_at ?? null })
  return { mode, ...result, about_me: next.trim() }
}

export const setCommonHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

/** Wraps an endpoint that needs an agent key and takes one HTTP method (GET by default). */
export const keyedEndpoint = (handler, method = 'GET') => async (req, res) => {
  setCommonHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== method) return res.status(405).json({ error: `Use ${method}.` })
  const key = getAgentKey(req)
  if (!key) return res.status(401).json({ error: 'Pass an agent key as ?key=… or Authorization: Bearer ….' })
  try {
    await handler(req, res, key)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Unexpected error' })
  }
}
