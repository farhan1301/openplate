// Workout tracking: gym days, the workout plan (routines), training goals and
// body weight (see supabase/migrations/*_fitness.sql). Agents change the same rows through
// meals_agent_fitness, so the Fitness tab reloads on focus. The calendar rules
// here match meals_fitness_day_status() in the database.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { addDays, isoDay, parseDay, today } from './nutrition'

const ok = (result) => {
  if (result.error) throw result.error
  return result.data
}

export const WEEKDAYS = [
  { value: 'mon', label: 'Mon', narrow: 'M' },
  { value: 'tue', label: 'Tue', narrow: 'T' },
  { value: 'wed', label: 'Wed', narrow: 'W' },
  { value: 'thu', label: 'Thu', narrow: 'T' },
  { value: 'fri', label: 'Fri', narrow: 'F' },
  { value: 'sat', label: 'Sat', narrow: 'S' },
  { value: 'sun', label: 'Sun', narrow: 'S' },
]

export const STATUSES = [
  { value: 'done', label: 'Worked out' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'rest', label: 'Rest day' },
]

export const KINDS = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'sport', label: 'Sport' },
  { value: 'other', label: 'Other' },
]

export const INTENSITIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard', label: 'Hard' },
]

/** "mon" … "sun" for a YYYY-MM-DD day. */
export const weekdayOf = (day) => WEEKDAYS[(parseDay(day).getDay() + 6) % 7].value

/** The Monday of the week holding `day`. */
export const mondayOf = (day) => addDays(day, -((parseDay(day).getDay() + 6) % 7))

export const monthStart = (day) => `${day.slice(0, 7)}-01`
export const addMonths = (day, n) => {
  const date = parseDay(monthStart(day))
  return isoDay(new Date(date.getFullYear(), date.getMonth() + n, 1))
}
export const monthEnd = (day) => addDays(addMonths(day, 1), -1)

export const sortDays = (days) => WEEKDAYS.map(d => d.value).filter(d => (days || []).includes(d))

export const formatDays = (days) => {
  const sorted = sortDays(days)
  if (sorted.length === 7) return 'Every day'
  return sorted.map(d => WEEKDAYS.find(w => w.value === d).label).join(', ')
}

/** "4 × 8 · 155 lb" for one exercise. */
export const exerciseSummary = (exercise, unit) => [
  exercise.sets && exercise.reps ? `${exercise.sets} × ${exercise.reps}` : exercise.sets ? `${exercise.sets} sets` : exercise.reps ? `${exercise.reps} reps` : null,
  exercise.weight ? `${exercise.weight} ${unit}` : null,
  exercise.duration_minutes ? `${exercise.duration_minutes} min` : null,
  exercise.distance_km ? `${exercise.distance_km} km` : null,
].filter(Boolean).join(' · ')

/**
 * Builds the calendar rules from the loaded log:
 * done (a workout) · missed (logged as skipped, or a planned gym day that
 * passed with nothing logged, counted from the first workout ever logged) ·
 * rest (a logged rest day) · planned (a gym day today or later) · null.
 */
export function buildCalendar(workouts, goals, firstDone) {
  const byDay = new Map()
  workouts.forEach(w => {
    if (!byDay.has(w.done_on)) byDay.set(w.done_on, [])
    byDay.get(w.done_on).push(w)
  })
  const gymDays = goals?.gym_days || []
  const now = today()

  const statusOf = (day) => {
    const rows = byDay.get(day) || []
    if (rows.some(w => w.status === 'done')) return 'done'
    if (rows.some(w => w.status === 'skipped')) return 'missed'
    if (rows.some(w => w.status === 'rest')) return 'rest'
    if (gymDays.includes(weekdayOf(day))) {
      if (day >= now) return 'planned'
      if (firstDone && day >= firstDone) return 'missed'
    }
    return null
  }

  /** Distinct days with a workout in the Mon–Sun week starting `monday`. */
  const weekCount = (monday) => {
    let n = 0
    for (let i = 0; i < 7; i += 1) {
      if ((byDay.get(addDays(monday, i)) || []).some(w => w.status === 'done')) n += 1
    }
    return n
  }

  return { byDay, statusOf, weekCount }
}

const WORKOUT_FIELDS = 'id, done_on, status, title, routine_id, kind, duration_minutes, intensity, calories_burned, exercises, notes, logged_by, created_at'
const GOAL_FIELDS = 'days_per_week, gym_days, session_minutes, weight_unit, target_weight, focus, updated_at, updated_by'

/** Workouts from `fromDay` (at least half a year back, for streaks), plus goals, routines and weigh-ins. */
export function useFitness(fromDay) {
  const [state, setState] = useState({ goals: null, routines: [], workouts: [], body: [], firstDone: null, loading: true, error: '', missing: false })
  const requestRef = useRef(0)
  const halfYear = addDays(mondayOf(today()), -7 * 26)
  const start = fromDay && fromDay < halfYear ? fromDay : halfYear

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    try {
      const [goals, routines, workouts, body, first] = await Promise.all([
        supabase.from('fitness_goals').select(GOAL_FIELDS).eq('id', 1).maybeSingle().then(ok),
        supabase.from('workout_routines').select('id, name, days, focus, exercises, notes, updated_by').order('name').then(ok),
        supabase.from('workout_log').select(WORKOUT_FIELDS).gte('done_on', start).order('done_on').order('created_at').then(ok),
        supabase.from('body_log').select('id, measured_on, weight, body_fat, notes, logged_by').gte('measured_on', addDays(today(), -365)).order('measured_on').then(ok),
        supabase.from('workout_log').select('done_on').eq('status', 'done').order('done_on').limit(1).then(ok),
      ])
      if (request !== requestRef.current) return
      setState({ goals: goals || {}, routines, workouts, body, firstDone: first[0]?.done_on || null, loading: false, error: '', missing: false })
    } catch (err) {
      if (request !== requestRef.current) return
      // supabase/migrations/*_fitness.sql not run yet.
      const missing = err.code === '42P01' || err.code === 'PGRST205'
      setState(prev => ({ ...prev, loading: false, missing, error: missing ? '' : err.message || 'Could not load your workouts.' }))
    }
  }, [start])

  useEffect(() => {
    refresh()
    // Agents log workouts from elsewhere: pick them up when coming back to the app.
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

  const saveWorkout = useCallback(({ id, ...fields }) => run(async () => {
    if (id) ok(await supabase.from('workout_log').update(fields).eq('id', id))
    else ok(await supabase.from('workout_log').insert(fields))
  }), [run])

  const removeWorkout = useCallback((workout) => run(async () => {
    ok(await supabase.from('workout_log').delete().eq('id', workout.id))
  }), [run])

  const restoreWorkout = useCallback((workout) => run(async () => {
    ok(await supabase.from('workout_log').insert(workout))
  }), [run])

  const saveRoutine = useCallback(({ id, ...fields }) => run(async () => {
    const row = { ...fields, updated_at: new Date().toISOString(), updated_by: 'App' }
    if (id) ok(await supabase.from('workout_routines').update(row).eq('id', id))
    else ok(await supabase.from('workout_routines').insert(row))
  }), [run])

  const deleteRoutine = useCallback((routine) => run(async () => {
    ok(await supabase.from('workout_routines').delete().eq('id', routine.id))
  }), [run])

  const saveGoals = useCallback((goals) => run(async () => {
    ok(await supabase.from('fitness_goals').update({ ...goals, updated_at: new Date().toISOString(), updated_by: 'App' }).eq('id', 1))
  }), [run])

  const saveBody = useCallback(({ id, ...fields }) => run(async () => {
    if (id) ok(await supabase.from('body_log').update(fields).eq('id', id))
    else ok(await supabase.from('body_log').upsert({ ...fields, logged_by: 'App' }, { onConflict: 'measured_on' }))
  }), [run])

  const deleteBody = useCallback((entry) => run(async () => {
    ok(await supabase.from('body_log').delete().eq('id', entry.id))
  }), [run])

  return {
    ...state,
    refresh,
    clearError: () => setState(prev => ({ ...prev, error: '' })),
    saveWorkout,
    removeWorkout,
    restoreWorkout,
    saveRoutine,
    deleteRoutine,
    saveGoals,
    saveBody,
    deleteBody,
  }
}
