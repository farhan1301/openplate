// AI agent access: agent keys (read-only unless "Can make changes" is on),
// the "about me" notes, the snapshot and guide agents see and the log of their
// changes (see docs/MEALS_AGENT.md, supabase/migrations/*_agent_access.sql,
// supabase/migrations/*_agent_write.sql and supabase/migrations/*_agent_guide.sql).
// Only a hash of each key is stored; the key itself is returned once by createAgentKey.
import { supabase } from './supabase'

const ok = (result) => {
  if (result.error) throw result.error
  return result.data
}

/** Everything an agent sees, as one JSON document (same as GET /api/agent/snapshot). */
export const fetchKitchenSnapshot = async () => ok(await supabase.rpc('get_kitchen_snapshot'))

export const fetchAboutMe = async () => {
  const row = ok(await supabase.from('meals_profile').select('about_me').eq('id', 1).maybeSingle())
  return row?.about_me || ''
}

export const saveAboutMe = async (aboutMe) => {
  ok(await supabase.from('meals_profile').update({ about_me: aboutMe, updated_at: new Date().toISOString() }).eq('id', 1))
}

/**
 * The kitchen guide as agents see it: { content, customized, updated_at, updated_by }.
 * content is null while the built-in docs/MEALS_AGENT.md is in use.
 */
export const fetchKitchenGuide = async () => ok(await supabase.rpc('get_meals_agent_guide'))

/** Drops agents' edits so they read the built-in guide again. */
export const resetKitchenGuide = async () => {
  ok(await supabase.from('meals_agent_guide').update({ content: null, updated_at: new Date().toISOString(), updated_by: 'App' }).eq('id', 1))
}

/**
 * Saves the guide agents read. null (or the built-in text) goes back to the
 * built-in guide. baseUpdatedAt is the updated_at the edit started from: if an
 * agent changed the guide in between, nothing is saved and this throws.
 */
export const saveKitchenGuide = async (content, baseUpdatedAt, builtIn) => {
  const text = content?.trim() ? content : null
  const next = text && text.trim() === builtIn?.trim() ? null : text
  let query = supabase.from('meals_agent_guide')
    .update({ content: next, updated_at: new Date().toISOString(), updated_by: 'App' })
    .eq('id', 1)
  query = baseUpdatedAt ? query.eq('updated_at', baseUpdatedAt) : query.is('updated_at', null)
  const rows = ok(await query.select('id'))
  if (!rows.length) throw new Error('The guide changed while you were editing (an agent may have updated it). Copy your text, close and reopen the guide, and redo your edit.')
}

export const listAgentKeys = async () => ok(await supabase.rpc('list_meals_agent_keys'))

/** Returns { id, label, token, can_write }. The token is never shown again. */
export const createAgentKey = async (label, canWrite = false) => ok(await supabase.rpc('create_meals_agent_key', { p_label: label, p_can_write: canWrite }))

export const setAgentKeyWrite = async (id, canWrite) => ok(await supabase.rpc('set_meals_agent_token_write', { p_id: id, p_can_write: canWrite }))

/** Most recent changes agents made, newest first. */
export const listAgentActions = async (limit = 20) => ok(await supabase.rpc('list_meals_agent_actions', { p_limit: limit }))

export const revokeAgentKey = async (id) => ok(await supabase.rpc('revoke_meals_agent_token', { p_id: id }))
