// node --test — room graph merging (pure, no DB)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeGraphs, isContradiction } from '../src/utils/mergeGraphs.js'
import { roomParamsSchema, roomQuerySchema, extractRequestSchema } from '../src/schemas/graph.schema.js'

const node = (id, kind = 'Claim') => ({ id, type: 'concept', position: { x: 0, y: 0 }, data: { label: id, kind, weight: 0.5 } })
const rel = (source, target) => ({ id: `e_${source}__${target}`, source, target, type: 'default', className: 'edge-solid', data: { gap: false } })
const gap = (source, target) => ({ id: `e_${source}__${target}`, source, target, type: 'contradiction', className: 'edge-gap', data: { gap: true } })

test('mergeGraphs: dedupes nodes, drops orphans, upgrades relation → contradiction, keeps old edge id', () => {
  const note1 = { nodes: [node('remote_work', 'Topic'), node('productivity_up')], edges: [rel('remote_work', 'productivity_up')] }
  const note2 = {
    nodes: [node('productivity_up'), node('output_dropped')], // productivity_up re-saved by a 2nd user
    edges: [
      gap('output_dropped', 'productivity_up'),
      gap('remote_work', 'productivity_up'), // same pair as note1's relation → upgraded
      rel('output_dropped', 'seed_node_never_persisted'), // orphan
      rel('output_dropped', 'output_dropped'), // self-loop
    ],
  }
  const { nodes, edges, orphanEdges } = mergeGraphs([note1, note2])
  assert.deepEqual(nodes.map((n) => n.id), ['remote_work', 'productivity_up', 'output_dropped'])
  assert.equal(edges.length, 2)
  assert.equal(orphanEdges, 2)
  const upgraded = edges.find((e) => e.source === 'remote_work')
  assert.equal(upgraded.type, 'contradiction')
  assert.equal(upgraded.id, 'e_remote_work__productivity_up')
  assert.equal(edges.filter(isContradiction).length, 2)
  // legacy rows (before the custom edge type) are still recognised
  assert.equal(isContradiction({ type: 'default', className: 'edge-gap' }), true)
})

test('mergeGraphs: tolerates empty / malformed stored graphs', () => {
  const { nodes, edges } = mergeGraphs([null, {}, { nodes: [{ id: '' }], edges: [{}] }])
  assert.deepEqual({ nodes, edges }, { nodes: [], edges: [] })
})

test('room schemas', () => {
  assert.equal(roomParamsSchema.safeParse({ roomId: 'hack-synth_2026' }).success, true)
  assert.equal(roomParamsSchema.safeParse({ roomId: 'a/b' }).success, false)
  assert.deepEqual(roomQuerySchema.parse({}), { limit: 200, layout: 'dagre' })
  assert.equal(roomQuerySchema.safeParse({ limit: '9999' }).success, false)
  assert.equal(extractRequestSchema.parse({ text: 'hello world', room_id: ' room-1 ' }).room_id, 'room-1')
  assert.equal(extractRequestSchema.parse({ text: 'hello world' }).room_id, undefined)
})
