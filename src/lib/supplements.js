// Supplements: what the owner takes, how much and when, and the doses ticked
// off each day (see supabase/migrations/*_supplements.sql). Agents change the same rows
// through meals_agent_supplements, so the card reloads on focus.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const ok = (result) => {
  if (result.error) throw result.error
  return result.data
}

export const TIMES = [
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'evening', label: 'Evening' },
  { value: 'bedtime', label: 'Bedtime' },
]
const ANY = { value: 'any', label: 'Any time' }
export const SLOTS = [...TIMES, ANY]
export const slotLabel = (value) => SLOTS.find(s => s.value === value)?.label || value

export const STATUSES = [
  { value: 'taking', label: 'Taking' },
  { value: 'trying', label: 'Trying' },
  { value: 'paused', label: 'Paused' },
]

/** The slots a supplement is due in: its times in day order, or "any". */
export const slotsOf = (supplement) => {
  const times = TIMES.map(t => t.value).filter(t => (supplement.times || []).includes(t))
  return times.length ? times : ['any']
}

export const isActive = (supplement) => supplement.status !== 'paused'

const FIELDS = 'id, name, dose, times, status, purpose, notes, started_on, updated_at, updated_by'

/** Every supplement, plus the doses taken on `day`. */
export function useSupplements(day) {
  const [state, setState] = useState({ supplements: [], taken: [], loading: true, error: '', missing: false })
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    try {
      const [supplements, taken] = await Promise.all([
        supabase.from('supplements').select(FIELDS).order('name').then(ok),
        supabase.from('supplement_log').select('id, supplement_id, time, logged_by').eq('taken_on', day).then(ok),
      ])
      if (request !== requestRef.current) return
      setState({ supplements, taken, loading: false, error: '', missing: false })
    } catch (err) {
      if (request !== requestRef.current) return
      // supabase/migrations/*_supplements.sql not run yet.
      const missing = err.code === '42P01' || err.code === 'PGRST205'
      setState(prev => ({ ...prev, loading: false, missing, error: missing ? '' : err.message || 'Could not load your supplements.' }))
    }
  }, [day])

  useEffect(() => {
    refresh()
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

  const isTaken = useCallback(
    (supplement, slot) => state.taken.some(t => t.supplement_id === supplement.id && t.time === slot),
    [state.taken],
  )

  /** Ticks or un-ticks one dose; the tick shows straight away. */
  const toggle = useCallback((supplement, slot) => {
    const taken = isTaken(supplement, slot)
    setState(prev => ({
      ...prev,
      taken: taken
        ? prev.taken.filter(t => !(t.supplement_id === supplement.id && t.time === slot))
        : [...prev.taken, { id: `pending-${supplement.id}-${slot}`, supplement_id: supplement.id, time: slot, logged_by: 'App' }],
    }))
    return run(async () => {
      if (taken) {
        ok(await supabase.from('supplement_log').delete().eq('supplement_id', supplement.id).eq('taken_on', day).eq('time', slot))
      } else {
        ok(await supabase.from('supplement_log').upsert(
          { supplement_id: supplement.id, taken_on: day, time: slot, logged_by: 'App' },
          { onConflict: 'supplement_id,taken_on,time', ignoreDuplicates: true },
        ))
      }
    }).catch(() => {})
  }, [day, isTaken, run])

  const save = useCallback(({ id, ...fields }) => run(async () => {
    const row = { ...fields, updated_at: new Date().toISOString(), updated_by: 'App' }
    if (id) ok(await supabase.from('supplements').update(row).eq('id', id))
    else ok(await supabase.from('supplements').insert(row))
  }), [run])

  const remove = useCallback((supplement) => run(async () => {
    ok(await supabase.from('supplements').delete().eq('id', supplement.id))
  }), [run])

  /** Undo for remove: puts the supplement back (the doses it had are gone). */
  const restore = useCallback((supplement) => run(async () => {
    ok(await supabase.from('supplements').insert(supplement))
  }), [run])

  return {
    ...state,
    refresh,
    clearError: () => setState(prev => ({ ...prev, error: '' })),
    isTaken,
    toggle,
    save,
    remove,
    restore,
  }
}
