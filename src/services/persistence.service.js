import { supabase } from '../config/supabase.js'
import { AppError } from '../middleware/errorHandler.js'

/**
 * Stores the raw note + its extracted graph, tagged with the multiplayer room it belongs to.
 * Returns the note id, or null when Supabase isn't configured.
 */
export async function saveNote({ text, nodes, edges, room_id = null }) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('notes')
    .insert({ content: text, graph: { nodes, edges }, room_id })
    .select('id')
    .single()
  if (error) throw new AppError(500, `Supabase insert failed: ${error.message}`)
  return data.id
}

/** All notes of a room, oldest first (the newest `limit` rows). Throws 503 when Supabase isn't configured. */
export async function listRoomNotes(room_id, { limit = 200 } = {}) {
  if (!supabase) {
    throw new AppError(503, 'Supabase is not configured on this server (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
  }
  const { data, error } = await supabase
    .from('notes')
    .select('id, content, graph, created_at')
    .eq('room_id', room_id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new AppError(500, `Supabase query failed: ${error.message}`)
  return (data ?? []).reverse()
}
