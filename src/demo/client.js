// Demo mode: an in-memory stand-in for the Supabase client, so the app runs
// with sample data and no backend (VITE_DEMO=true). It supports exactly the
// query-builder calls the app makes. Changes live in memory and reset on reload.
import { buildSeed, DEFAULTS, newId, UNIQUE } from './seed'

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const now = () => new Date().toISOString()
const SINGLETON = new Set(['meals_profile', 'meals_agent_guide', 'nutrition_goals', 'fitness_goals'])
const EMBEDS = { meals: { meal_ingredients: 'meal_id' } }

let db = buildSeed()

const fail = (message, code = 'DEMO') => ({ data: null, error: { message, code } })

/** Splits "a, b, child(x, y)" at top-level commas. */
const splitColumns = (cols) => {
  const out = []
  let depth = 0
  let current = ''
  for (const ch of cols || '*') {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) { out.push(current.trim()); current = '' } else current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

const project = (table, row, cols) => {
  const parts = splitColumns(cols)
  if (parts.includes('*') && parts.length === 1) return clone(row)
  const out = {}
  for (const part of parts) {
    const embed = part.match(/^(\w+)\((.*)\)$/)
    if (embed) {
      const [, child, childCols] = embed
      const fk = EMBEDS[table]?.[child]
      out[child] = (db.tables[child] || []).filter(r => r[fk] === row.id).map(r => project(child, r, childCols))
    } else if (part === '*') Object.assign(out, clone(row))
    else out[part] = clone(row[part] ?? null)
  }
  return out
}

const compare = (a, b) => {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return a < b ? -1 : 1
}

class Query {
  constructor(table) {
    this.table = table
    this.op = 'select'
    this.filters = []
    this.orders = []
    this.cols = '*'
    this.returning = null
    this.limitTo = null
    this.mode = null
  }

  select(cols = '*') {
    if (this.op === 'select') this.cols = cols
    else this.returning = cols
    return this
  }

  insert(payload) { this.op = 'insert'; this.payload = payload; return this }
  update(payload) { this.op = 'update'; this.payload = payload; return this }
  upsert(payload, opts = {}) { this.op = 'upsert'; this.payload = payload; this.opts = opts; return this }
  delete() { this.op = 'delete'; return this }

  eq(col, value) { this.filters.push(r => r[col] === value); return this }
  in(col, values) { this.filters.push(r => values.includes(r[col])); return this }
  is(col, value) { this.filters.push(r => (r[col] ?? null) === value); return this }
  gte(col, value) { this.filters.push(r => r[col] >= value); return this }
  lte(col, value) { this.filters.push(r => r[col] <= value); return this }
  order(col, { ascending = true } = {}) { this.orders.push([col, ascending]); return this }
  limit(n) { this.limitTo = n; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  matches(row) { return this.filters.every(f => f(row)) }

  build(row) {
    const base = SINGLETON.has(this.table) ? {} : { id: newId(), created_at: now() }
    return { ...base, ...(DEFAULTS[this.table]?.() || {}), ...clone(row) }
  }

  findConflict(row, keys) {
    return (db.tables[this.table] || []).find(r => keys.every(k => (r[k] ?? null) === (row[k] ?? null)))
  }

  run() {
    const rows = db.tables[this.table]
    if (!rows) return fail(`Demo mode has no table "${this.table}".`)
    let result = []

    if (this.op === 'select') {
      result = rows.filter(r => this.matches(r))
      for (const [col, asc] of [...this.orders].reverse()) {
        result = [...result].sort((a, b) => (asc ? 1 : -1) * compare(a[col], b[col]))
      }
      if (this.limitTo !== null) result = result.slice(0, this.limitTo)
      result = result.map(r => project(this.table, r, this.cols))
    } else if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      const unique = UNIQUE[this.table]
      for (const item of list) {
        const row = this.build(item)
        if (unique && this.findConflict(row, unique)) return fail('duplicate key value violates unique constraint', '23505')
        rows.push(row)
        result.push(row)
      }
    } else if (this.op === 'update') {
      for (const row of rows.filter(r => this.matches(r))) {
        Object.assign(row, clone(this.payload))
        result.push(row)
      }
    } else if (this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      const keys = (this.opts.onConflict || 'id').split(',').map(k => k.trim())
      for (const item of list) {
        const existing = this.findConflict(item, keys)
        if (existing) {
          if (!this.opts.ignoreDuplicates) { Object.assign(existing, clone(item)); result.push(existing) }
        } else {
          const row = this.build(item)
          rows.push(row)
          result.push(row)
        }
      }
    } else if (this.op === 'delete') {
      result = rows.filter(r => this.matches(r))
      db.tables[this.table] = rows.filter(r => !this.matches(r))
    }

    if (this.op !== 'select') {
      if (this.returning === null) return { data: null, error: null }
      result = result.map(r => project(this.table, r, this.returning))
    }
    if (this.mode === 'single') {
      return result.length === 1 ? { data: result[0], error: null } : fail('JSON object requested, multiple (or no) rows returned', 'PGRST116')
    }
    if (this.mode === 'maybe') return { data: result[0] ?? null, error: null }
    return { data: result, error: null }
  }

  then(resolve, reject) {
    return new Promise(r => setTimeout(r, 0)).then(() => this.run()).then(resolve, reject)
  }
}

/** A small snapshot like get_kitchen_snapshot's, for "Copy guide + snapshot". */
const snapshot = () => {
  const t = db.tables
  const stock = new Map(t.pantry.map(p => [p.ingredient_id, p.in_stock]))
  const name = new Map(t.ingredients.map(i => [i.id, i.name]))
  const meals = t.meals.map(m => {
    const items = t.meal_ingredients.filter(mi => mi.meal_id === m.id)
    const missing = items.filter(mi => !mi.optional && !stock.get(mi.ingredient_id)).map(mi => name.get(mi.ingredient_id))
    return { name: m.name, missing_essentials: missing, ready: missing.length === 0 }
  })
  return {
    schema_version: 4,
    demo: true,
    as_of: db.today,
    about_me: t.meals_profile[0].about_me,
    ready_to_cook: meals.filter(m => m.ready).map(m => m.name),
    meals,
    pantry_in_stock: t.pantry.filter(p => p.in_stock).map(p => name.get(p.ingredient_id)),
    grocery_list: t.shopping_cart.map(c => ({ ingredient: name.get(c.ingredient_id), picked_up: c.checked })),
    note: 'Demo data. Install your own OpenPlate to connect a real AI agent.',
  }
}

const rpc = async (fn, args = {}) => {
  await new Promise(r => setTimeout(r, 0))
  switch (fn) {
    case 'meals_user_has_access': return { data: true, error: null }
    case 'get_kitchen_snapshot': return { data: snapshot(), error: null }
    case 'get_meals_agent_guide': {
      const g = db.tables.meals_agent_guide[0]
      return { data: { content: g.content, customized: g.content !== null, updated_at: g.updated_at, updated_by: g.updated_by }, error: null }
    }
    case 'list_meals_agent_keys': return { data: clone(db.agentKeys), error: null }
    case 'list_meals_agent_actions': return { data: clone(db.agentActions.slice(0, args.p_limit || 20)), error: null }
    case 'set_meals_agent_token_write': {
      const key = db.agentKeys.find(k => k.id === args.p_id)
      if (key) key.can_write = Boolean(args.p_can_write)
      return { data: clone(key), error: null }
    }
    case 'revoke_meals_agent_token': {
      const key = db.agentKeys.find(k => k.id === args.p_id)
      if (key) key.revoked_at = now()
      return { data: true, error: null }
    }
    case 'create_meals_agent_key':
      return fail('This is the demo, so there is no real database for an agent to connect to. Install your own OpenPlate (free, one prompt) to create keys.')
    default:
      return fail(`"${fn}" isn't available in the demo.`)
  }
}

const DEMO_USER = { id: 'demo-user', email: 'demo@openplate.app', user_metadata: { full_name: 'Demo user' } }
const DEMO_SESSION = { access_token: 'demo', token_type: 'bearer', user: DEMO_USER }

export const demoClient = {
  from: (table) => new Query(table),
  rpc,
  auth: {
    getSession: async () => ({ data: { session: DEMO_SESSION }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { db = buildSeed(); window.location.reload(); return { error: null } },
    signInWithOtp: async () => ({ error: null }),
    signInWithOAuth: async () => ({ error: null }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: { message: 'Photo uploads are off in the demo. Paste an image link instead.' } }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
}
