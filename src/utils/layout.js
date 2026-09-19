import dagre from '@dagrejs/dagre'

// Matches the ConceptNode footprint on the frontend (w-[220px], ~120px tall with summary)
const NODE_W = 220
const NODE_H = 120

/**
 * Assigns React Flow positions with Dagre so the graph arrives pre-laid-out.
 * `origin` lets the client drop a freshly synthesized cluster away from existing nodes.
 */
export function layoutGraph(nodes, edges, { origin = { x: 0, y: 0 }, direction = 'LR' } = {}) {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 56, ranksep: 140, marginx: 24, marginy: 24 })

  const clusters = new Set()
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H })
    
    // Mentor feature: Cluster nodes by type/kind
    const kind = n.data?.kind
    if (kind) {
      const clusterId = `cluster_${kind}`
      if (!clusters.has(clusterId)) {
        clusters.add(clusterId)
        g.setNode(clusterId, { label: clusterId })
      }
      g.setParent(n.id, clusterId)
    }
  }
  for (const e of edges) if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)

  dagre.layout(g)

  return nodes.map((n) => {
    const { x, y } = g.node(n.id)
    return {
      ...n,
      position: { x: Math.round(origin.x + x - NODE_W / 2), y: Math.round(origin.y + y - NODE_H / 2) },
    }
  })
}
