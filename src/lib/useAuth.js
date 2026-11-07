import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Session + allowlist state. `status` is one of:
 * loading | signed-out | checking | allowed | denied
 */
export function useAuth() {
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('loading')
  const userId = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setStatus('signed-out')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) setStatus('signed-out')
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setStatus('checking')
    supabase.rpc('meals_user_has_access').then(({ data, error }) => {
      if (cancelled) return
      if (error) console.error('Access check failed:', error)
      setStatus(data === true ? 'allowed' : 'denied')
    })
    return () => { cancelled = true }
  }, [userId])

  return { session, status, signOut: () => supabase.auth.signOut() }
}
