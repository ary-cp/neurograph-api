import { z } from 'zod'

export const NODE_KINDS = ['Topic', 'Claim', 'Entity', 'Event', 'Question']

// LLaMA sometimes free-styles the kind; map common variants instead of failing the request.
const KIND_ALIASES = {
  concept: 'Topic', theme: 'Topic', subject: 'Topic', idea: 'Topic', note: 'Topic',
  statement: 'Claim', opinion: 'Claim', hypothesis: 'Claim', decision: 'Claim', assertion: 'Claim', argument: 'Claim',
  person: 'Entity', people: 'Entity', organization: 'Entity', organisation: 'Entity', org: 'Entity',
  company: 'Entity', product: 'Entity', tool: 'Entity', place: 'Entity', team: 'Entity',
  meeting: 'Event', deadline: 'Event', milestone: 'Event', launch: 'Event',
  problem: 'Question', unknown: 'Question', doubt: 'Question', risk: 'Question',
}

export function normalizeKind(raw) {
  const k = String(raw ?? '').trim().toLowerCase()
  return NODE_KINDS.find((x) => x.toLowerCase() === k) ?? KIND_ALIASES[k] ?? 'Topic'
}

const unit = (fallback) => z.coerce.number().min(0).max(1).catch(fallback)
const str = (max) => z.string().nullish().transform((v) => String(v ?? '').trim().slice(0, max))

// ── What the LLM must return (lenient: truncate/normalise rather than reject) ──
export const llmNodeSchema = z.object({
  id: str(64),
  label: str(80),
  kind: z.string().nullish().transform(normalizeKind),
  weight: unit(0.5),
  summary: str(240),
})

export const llmEdgeSchema = z.object({
  source: str(64),
  target: str(64),
  label: str(40).transform((v) => v || 'relates to'),
  type: z.enum(['relation', 'contradiction']).catch('relation'),
  confidence: unit(0.6),
})

export const INTENTS = ['analytical', 'brainstorm', 'research']

export const llmGraphSchema = z.object({
  // Dynamic Intent Routing: the model deduces the user's mode in the same pass as the extraction
  intent: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(INTENTS).catch('analytical')),
  nodes: z.array(llmNodeSchema).max(40), // required → a wrong top-level shape triggers a retry
  edges: z.array(llmEdgeSchema).max(80).default([]),
})

/** Room ids double as URL slugs: letters, digits, "-" and "_" only. */
export const roomIdSchema = z
  .string()
  .trim()
  .min(1, 'room_id cannot be empty')
  .max(64, 'room_id must be ≤ 64 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'room_id may only contain letters, digits, "-" and "_"')

// ── What the frontend sends ──
export const extractRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'text must be at least 1 character')
    .max(12_000, 'text must be ≤ 12,000 characters'),
  // Nodes already on the canvas → lets the model link to them and flag contradictions
  existingNodes: z
    .array(z.object({ id: z.string().min(1).max(64), label: z.string().max(120), kind: z.string().optional() }))
    .max(200)
    .default([]),
  origin: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  direction: z.enum(['LR', 'TB']).default('LR'),
  persist: z.boolean().default(false),
  // Multiplayer: the shared room this note belongs to (stored on the notes row when persist=true)
  room_id: roomIdSchema.optional(),
})

// ── Multiplayer rooms ──
export const roomParamsSchema = z.object({ roomId: roomIdSchema })

export const roomQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200), // newest N notes are still returned oldest-first
  layout: z.enum(['dagre', 'stored']).default('dagre'), // dagre = fresh combined layout; stored = positions as saved
})
