import { slugify, shortHash } from './slug.js'

export const MIN_EDGE_CONFIDENCE = 0.4

/**
 * Post-LLM hygiene. The model is *asked* to behave; this is where we *guarantee* it:
 *  - ids → ASCII snake_case, unique
 *  - nodes the model re-created for an existing concept are dropped (edges still bind to the existing id)
 *  - edges with unknown endpoints, self-loops, duplicates or low confidence are dropped
 */
export function sanitizeGraph(graph, existingIds = []) {
  const existing = new Set(existingIds)
  const idMap = new Map() // raw id → canonical id
  const seen = new Set()
  const nodes = []

  for (const n of graph.nodes ?? []) {
    if (!n.label) continue
    const id = existing.has(n.id) ? n.id : slugify(n.id, `n_${shortHash(n.label)}`)
    idMap.set(n.id, id)
    if (existing.has(id) || seen.has(id)) continue
    seen.add(id)
    nodes.push({ ...n, id })
  }

  const known = new Set([...seen, ...existing])
  const resolve = (raw) => (existing.has(raw) ? raw : (idMap.get(raw) ?? slugify(raw)))
  const edgeSeen = new Set()
  const edges = []
  let dropped = 0

  for (const e of graph.edges ?? []) {
    const source = resolve(e.source)
    const target = resolve(e.target)
    const key = `${source}->${target}`
    const bad =
      source === target ||
      !known.has(source) ||
      !known.has(target) ||
      edgeSeen.has(key) ||
      e.confidence < MIN_EDGE_CONFIDENCE
    if (bad) {
      dropped++
      continue
    }
    edgeSeen.add(key)
    edges.push({ ...e, source, target })
  }

  return { nodes, edges, dropped }
}
