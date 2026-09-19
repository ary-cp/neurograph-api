// node --test — exercises the post-LLM pipeline with deliberately messy model output (no network needed)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLLMJson } from '../src/utils/parseLLMJson.js'
import { llmGraphSchema } from '../src/schemas/graph.schema.js'
import { sanitizeGraph } from '../src/utils/sanitizeGraph.js'
import { toReactFlow } from '../src/services/format.service.js'
import { layoutGraph } from '../src/utils/layout.js'

const messy = `Here is your graph:
\`\`\`json
{
  "nodes": [
    {"id": "Remote Work!", "label": "Remote Work", "kind": "concept", "weight": "0.9", "summary": null},
    {"id": "remote_work", "label": "Duplicate", "kind": "Topic"},
    {"id": "n2", "label": "Re-created existing node", "kind": "Claim"},
    {"id": "", "label": "दूरस्थ कार्य", "kind": "Topic", "weight": 2},
  ],
  "edges": [
    {"source": "Remote Work!", "target": "n2", "label": "contradicts", "type": "contradiction", "confidence": 0.9},
    {"source": "remote_work", "target": "ghost", "label": "x"},
    {"source": "remote_work", "target": "remote_work"},
    {"source": "remote_work", "target": "n2", "label": "weak", "confidence": 0.1},
  ],
}
\`\`\``

test('parse → validate → sanitize → format → layout', () => {
  const graph = llmGraphSchema.parse(parseLLMJson(messy))
  assert.equal(graph.nodes[0].kind, 'Topic') // alias normalised
  assert.equal(graph.nodes[0].weight, 0.9) // coerced from string
  assert.equal(graph.nodes[3].weight, 0.5) // out of range → fallback
  assert.equal(graph.intent, 'analytical') // missing → default mode
  assert.equal(llmGraphSchema.parse({ intent: ' Brainstorm ', nodes: [] }).intent, 'brainstorm') // case/whitespace tolerant
  assert.equal(llmGraphSchema.parse({ intent: 'research', nodes: [] }).intent, 'research')
  assert.equal(llmGraphSchema.parse({ intent: 'nonsense', nodes: [] }).intent, 'analytical') // unknown → default

  const { nodes, edges, dropped } = sanitizeGraph(graph, ['n2'])
  assert.equal(nodes[0].id, 'remote_work') // slugified
  assert.equal(nodes.length, 2) // duplicate + re-created existing dropped; Hindi node kept with hashed id
  assert.match(nodes[1].id, /^n_[a-z0-9]+$/)
  assert.equal(edges.length, 1) // ghost, self-loop, low-confidence dropped
  assert.equal(dropped, 3)
  assert.deepEqual([edges[0].source, edges[0].target, edges[0].type], ['remote_work', 'n2', 'contradiction'])

  const rf = toReactFlow({ nodes, edges })
  assert.equal(rf.edges[0].type, 'contradiction')
  assert.equal(rf.edges[0].className, 'edge-gap')
  assert.equal(rf.edges[0].label, 'CONTRADICTION')
  assert.equal(rf.nodes[0].type, 'concept')

  const laid = layoutGraph(rf.nodes, rf.edges, { origin: { x: 100, y: 50 } })
  assert.ok(laid.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)))
  assert.notDeepEqual(laid[0].position, laid[1].position)
})
