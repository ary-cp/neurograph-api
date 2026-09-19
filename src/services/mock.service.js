import { slugify } from '../utils/slug.js'

/** Fake graph so the frontend can be built without a Groq key (MOCK_LLM=true). */
export function mockGraph(text) {
  const words = text.split(/\s+/).filter(Boolean)
  const topicLabel = words.slice(0, 3).join(' ') || 'Untitled Thought'
  const tag = Date.now().toString(36).slice(-4) // avoid id collisions across repeated calls
  const t = `${slugify(topicLabel)}_${tag}`

  const intent = /https?:\/\//i.test(text) ? 'research' : /\?|\b(what if|should we|how might|ideas? for)\b/i.test(text) ? 'brainstorm' : 'analytical'

  return {
    intent,
    nodes: [
      { id: t, label: topicLabel, kind: 'Topic', weight: 1, summary: text.slice(0, 120) },
      { id: `${t}_claim_a`, label: 'Mock Claim A', kind: 'Claim', weight: 0.7, summary: 'First mock assertion.' },
      { id: `${t}_claim_b`, label: 'Mock Claim B', kind: 'Claim', weight: 0.6, summary: 'Second mock assertion.' },
      { id: `${t}_question`, label: 'Open Question', kind: 'Question', weight: 0.4, summary: 'Something unresolved.' },
    ],
    edges: [
      { source: t, target: `${t}_claim_a`, label: 'supports', type: 'relation', confidence: 0.9 },
      { source: t, target: `${t}_claim_b`, label: 'supports', type: 'relation', confidence: 0.8 },
      { source: `${t}_claim_a`, target: `${t}_claim_b`, label: 'contradicts', type: 'contradiction', confidence: 0.85 },
      { source: `${t}_claim_b`, target: `${t}_question`, label: 'raises', type: 'relation', confidence: 0.7 },
    ],
  }
}
