import { createClient } from '@supabase/supabase-js'

const FALLBACK_URL = 'https://not-configured.supabase.co'
const FALLBACK_KEY = 'public-anon-key-not-configured'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
