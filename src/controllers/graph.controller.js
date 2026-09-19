import { extractGraph } from '../services/extraction.service.js'
import { toReactFlow } from '../services/format.service.js'
import { saveNote } from '../services/persistence.service.js'
import { sanitizeGraph } from '../utils/sanitizeGraph.js'
import { layoutGraph } from '../utils/layout.js'
import { AppError } from '../middleware/errorHandler.js'
import fs from 'node:fs'
import { transcribeAudio } from '../services/transcription.service.js'

/**
 * POST /api/extract-graph
 * body: { text, existingNodes?, origin?, direction?, persist?, room_id? }
 * → { ok, nodes, edges, stats, meta }   (nodes/edges are React Flow-ready; meta.intent = analytical | brainstorm | research)
 */
export async function extractGraphHandler(req, res, next) {
  try {
    const { text, existingNodes, origin, direction, persist, room_id } = req.validated

    const { graph, meta } = await extractGraph({ text, existingNodes })
    const { nodes: cleanNodes, edges: cleanEdges, dropped } = sanitizeGraph(graph, existingNodes.map((n) => n.id))

    if (cleanNodes.length === 0 && cleanEdges.length === 0) {
      // Don't throw an error, just return empty gracefully
      return res.json({
        ok: true,
        nodes: [],
        edges: [],
        stats: { nodes: 0, edges: 0, contradictions: 0, droppedEdges: dropped },
        meta: { ...meta, noteId: null, persisted: false, room_id: room_id ?? null },
      })
    }

    const rf = toReactFlow({ nodes: cleanNodes, edges: cleanEdges })
    const nodes = layoutGraph(rf.nodes, rf.edges, { origin, direction })
    const noteId = persist ? await saveNote({ text, nodes, edges: rf.edges, room_id }) : null

    res.json({
      ok: true,
      nodes,
      edges: rf.edges,
      stats: {
        nodes: nodes.length,
        edges: rf.edges.length,
        contradictions: rf.edges.filter((e) => e.data.gap).length,
        droppedEdges: dropped,
      },
      meta: { ...meta, intent: graph.intent, noteId, persisted: noteId !== null, room_id: room_id ?? null },
    })
  } catch (err) {
    next(err)
  }
}

import { listRoomNotes } from '../services/persistence.service.js'

export async function getRoomHandler(req, res, next) {
  try {
    const { roomId } = req.params
    const { limit } = req.query
    const notes = await listRoomNotes(roomId, { limit })

    // Simply return the list of raw notes/graphs. 
    // The frontend will reconstruct/merge them using useGraphStore.
    res.json({ ok: true, notes })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/transcribe   multipart/form-data: audio=<file> [, language="hi" | "en" …] [, prompt="vocabulary hints"]
 * → { ok: true, text, meta: { model, language, duration, latencyMs, bytes, filename } }
 * The temp file multer wrote is always removed, whatever happens.
 */
export async function transcribeHandler(req, res, next) {
  const filePath = req.file?.path
  try {
    if (!req.file) throw new AppError(400, 'No audio received — send multipart/form-data with a file field named "audio"')

    const rawLang = typeof req.body?.language === 'string' ? req.body.language.trim().toLowerCase() : ''
    const language = /^[a-z]{2}$/.test(rawLang) ? rawLang : undefined
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 500) || undefined : undefined

    const { text, meta } = await transcribeAudio({ filePath, language, prompt })
    res.json({ ok: true, text, meta: { ...meta, bytes: req.file.size, filename: req.file.originalname } })
  } catch (err) {
    next(err)
  } finally {
    if (filePath) await fs.promises.unlink(filePath).catch(() => {})
  }
}
