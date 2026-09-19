/**
 * Domain graph → React Flow nodes/edges, matching the frontend's ConceptNode + edge CSS classes.
 * Positions are filled in afterwards by layoutGraph().
 */
export function toReactFlow({ nodes, edges }) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: 'concept',
      position: { x: 0, y: 0 },
      data: { label: n.label, kind: n.kind, weight: n.weight, summary: n.summary },
    })),
    edges: edges.map((e) => {
      const gap = e.type === 'contradiction'
      return {
        id: `e_${e.source}__${e.target}`,
        source: e.source,
        target: e.target,
        type: gap ? 'contradiction' : 'default', // frontend registers a ContradictionEdge for this type
        label: gap ? 'CONTRADICTION' : e.label,
        className: gap ? 'edge-gap' : 'edge-solid',
        data: { gap, type: e.type, confidence: e.confidence, relation: e.label },
        ...(gap && {
          labelStyle: { fill: '#f43f5e', fontWeight: 600, fontSize: 10, letterSpacing: '0.1em' },
          labelBgStyle: { fill: '#0b0f1a', fillOpacity: 0.9 },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
        }),
      }
    }),
  }
}
