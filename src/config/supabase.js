import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'
import WebSocket from 'ws'

/**
 * Server-side Supabase client (service role +' bypasses RLS; never ship this key to the browser).
 * null until SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, so the API runs without a DB.
 */
export const supabase =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { WebSocket }
      })
    : null
