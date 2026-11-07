import { createClient } from '@supabase/supabase-js'
import { demoClient } from '../demo/client'

// VITE_DEMO=true runs the whole app on built-in sample data with no backend
// (src/demo). Used for the public demo; your own install leaves it unset.
export const DEMO = import.meta.env.VITE_DEMO === 'true'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = DEMO ? demoClient : createClient(supabaseUrl, supabaseKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
