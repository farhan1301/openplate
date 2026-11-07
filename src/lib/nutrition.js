// Calorie & macro tracking: the food log, daily goals and saved meals'
// nutrition per serving (see supabase/migrations/*_nutrition.sql). Agents change the same
// rows through meals_agent_nutrition, so the Nutrition tab reloads on focus.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const ok = (result) => {
  if (result.error) throw result.error
  return result.data
}

export const NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
]
export const MACROS = NUTRIENTS.filter(n => n.key !== 'calories')

export const SLOTS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
]

/** A sensible slot for something eaten now. */
export const slotForNow = () => {
  const hour = new Date().getHours()
  return hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour >= 17 && hour < 22 ? 'dinner' : 'snack'
}

const pad = (n) => String(n).padStart(2, '0')
/** YYYY-MM-DD for a local date. */
export const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const today = () => isoDay(new Date())
export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return isoDay(new Date(y, m - 1, d + n))
}
export const parseDay = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "1,284" for calories, "42.5" / "42" for grams. */
export const formatAmount = (value, key) => {
  const n = Number(value) || 0
  return key === 'calories' ? Math.round(n).toLocaleString('en-CA') : String(Math.round(n * 10) / 10)
}

export const hasNutrition = (meal) => meal?.calories != null

/** Per-serving numbers × servings, rounded like the database does. */
export const scaleNutrition = (source, servings) => Object.fromEntries(
  NUTRIENTS.map(({ key }) => [key, Math.round((Number(source?.[key]) || 0) * servings * 10) / 10]),
)

export const sumNutrition = (entries) => Object.fromEntries(
  NUTRIENTS.map(({ key }) => [key, entries.reduce((total, entry) => total + (Number(entry[key]) || 0), 0)]),
)

const ENTRY_FIELDS = 'id, eaten_on, slot, name, meal_id, servings, calories, protein, carbs, fat, fiber, notes, logged_by, created_at'

export const logFood = async (entry) => ok(await supabase.from('food_log').insert(entry).select(ENTRY_FIELDS).single())

export const deleteFoodEntry = async (id) => { ok(await supabase.from('food_log').delete().eq('id', id)) }

/** Goals plus the food log for the `days` days ending on `endDay`. */
export function useNutrition(endDay, days = 7) {
  const [state, setState] = useState({ goals: null, entries: [], loading: true, error: '' })
  const requestRef = useRef(0)
  const startDay = addDays(endDay, -(days - 1))

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    try {
      const [goals, entries] = await Promise.all([
        supabase.from('nutrition_goals').select('calories, protein, carbs, fat, fiber, updated_at, updated_by').eq('id', 1).maybeSingle().then(ok),
        supabase.from('food_log').select(ENTRY_FIELDS).gte('eaten_on', startDay).lte('eaten_on', endDay).order('created_at').then(ok),
      ])
      if (request !== requestRef.current) return
      setState({ goals: goals || {}, entries, loading: false, error: '' })
    } catch (err) {
      if (request !== requestRef.current) return
      setState(prev => ({ ...prev, loading: false, error: err.message || 'Could not load your food log.' }))
    }
  }, [startDay, endDay])

  useEffect(() => {
    refresh()
    // Agents log food from elsewhere: pick it up when coming back to the app.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refresh])

  const run = useCallback(async (write) => {
    try {
      return await write()
    } catch (err) {
      setState(prev => ({ ...prev, error: err.message || 'Something went wrong. Please try again.' }))
      throw err
    } finally {
      await refresh()
    }
  }, [refresh])

  const saveEntry = useCallback(({ id, ...fields }) => run(async () => {
    if (id) ok(await supabase.from('food_log').update(fields).eq('id', id))
    else await logFood(fields)
  }), [run])

  const removeEntry = useCallback((entry) => run(() => deleteFoodEntry(entry.id)), [run])

  const restoreEntry = useCallback((entry) => run(async () => {
    ok(await supabase.from('food_log').insert(entry))
  }), [run])

  const saveGoals = useCallback((goals) => run(async () => {
    ok(await supabase.from('nutrition_goals').update({ ...goals, updated_at: new Date().toISOString(), updated_by: 'App' }).eq('id', 1))
  }), [run])

  return {
    ...state,
    startDay,
    refresh,
    clearError: () => setState(prev => ({ ...prev, error: '' })),
    saveEntry,
    removeEntry,
    restoreEntry,
    saveGoals,
  }
}
