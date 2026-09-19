# neurograph-server — the "Brain"

Express API that turns unstructured text into a **React Flow-ready knowledge graph** using Groq (LLaMA-3.3-70B).

```bash
cp .env.example .env      # paste GROQ_API_KEY, set MOCK_LLM=false
npm install
npm run dev               # http://localhost:4000  (node --watch)
npm test                  # pipeline unit test (no network)
npm run smoke             # hits the running server end-to-end
```

## Endpoints

| Method | Path                 | Body                                                      |
|--------|----------------------|-----------------------------------------------------------|
| GET    | `/api/health`        | —                                                         |
| POST   | `/api/extract-graph` | `{ text, existingNodes?, origin?, direction?, persist?, room_id? }` |
| POST   | `/api/transcribe`    | `multipart/form-data`: `audio` (file ≤ 25 MB), `language?` (ISO-639-1), `prompt?` |
| GET    | `/api/room/:roomId`  | query `limit` (≤500, default 200), `layout` = `dagre` \| `stored`      |

- `existingNodes` `[{ id, label, kind }]` — nodes already on the canvas. The model reuses their ids, links new
  nodes to them and emits `contradiction` edges against conflicting Claims.
- `origin` `{x, y}` — where to place the new cluster (default `0,0`); `direction` `LR | TB` (Dagre).
- `persist` — save note + graph to Supabase `notes` (needs `SUPABASE_*` env; see `supabase/schema.sql`).
- `room_id` — multiplayer room slug (`[A-Za-z0-9_-]{1,64}`); stored on the row when `persist` is true.
- **Rooms** — `GET /api/room/:roomId` loads every note of the room (oldest first), merges the graphs
  (`src/utils/mergeGraphs.js`: nodes dedupe by id, edges by pair, a later contradiction upgrades an earlier relation,
  orphan edges dropped), re-lays them out with Dagre unless `layout=stored`, and returns
  `{ room_id, nodes, edges, stats{notes,nodes,edges,contradictions,droppedEdges}, notes[{id,created_at,preview,nodes}] }`.
  503 when Supabase isn't configured. Existing DBs need: `alter table notes add column if not exists room_id text;`
- **Live Web Research** — any http(s) link inside `text` is fetched through [Jina Reader](https://jina.ai/reader)
  (`GET https://r.jina.ai/<url>`, `Authorization: Bearer $JINA_API_KEY`) and its Markdown is given to the model as a
  `WEB RESEARCH` source block. Fail-soft: a dead link never fails the request. `meta.research[]` reports each link
  (`{ ok, url, title, chars, truncated, cached }` or `{ ok: false, url, error }`). Knobs: `RESEARCH_ENABLED`,
  `RESEARCH_MAX_URLS` (default 2), `RESEARCH_MAX_CHARS` per page (default 8000 ≈ 2k tokens — Groq's free tier is 12k TPM).

### Response
```jsonc
{
  "ok": true,
  "nodes": [{ "id": "remote_work", "type": "concept", "position": { "x": 24, "y": 24 },
              "data": { "label": "Remote Work", "kind": "Topic", "weight": 1, "summary": "…" } }],
  "edges": [{ "id": "e_a__b", "source": "a", "target": "b", "label": "CONTRADICTION",
              "className": "edge-gap", "data": { "gap": true, "confidence": 0.9, "relation": "contradicts" } }],
  "stats": { "nodes": 5, "edges": 4, "contradictions": 1, "droppedEdges": 0 },
  "meta":  { "model": "llama-3.3-70b-versatile", "intent": "analytical", "attempt": 1, "latencyMs": 812, "tokens": {…}, "noteId": null }
}
```
`className` is `edge-solid` or `edge-gap` — exactly what the frontend CSS already styles.
**Voice-to-Graph** — `POST /api/transcribe` runs the upload through Groq Whisper (`GROQ_WHISPER_MODEL`, default
`whisper-large-v3`) and returns `{ ok, text, meta: { language, duration, latencyMs, bytes } }`; feed `text` into
`/api/extract-graph`. Accepts webm/ogg/m4a/mp4/mp3/wav/flac; MediaRecorder blobs without a filename are fine (the
extension is derived from the MIME type). The temp file is deleted after every request.

`meta.intent` is the model's read of the user's mode, deduced in the same pass (Dynamic Intent Routing):
`research` (a link / lookup request) · `brainstorm` (questions, options, what-ifs) · `analytical` (facts, notes, decisions — the default).

## Pipeline
`text → researchText (Jina Reader, parallel, 10-min cache) → Groq (JSON mode, system prompt in src/prompts) → parseLLMJson (fence/comma repair) → zod (lenient) →
sanitizeGraph (ids, dedupe, orphan/self-loop/low-confidence edges) → toReactFlow → Dagre layout`

Invalid model output is fed back to the model once, then the request fails with 502.

## Layout
```
server.js                      app wiring, CORS, helmet, graceful shutdown
src/config/      env.js        validated env (zod) · groq.js · supabase.js
src/routes/      index.js      /api/health + graph.routes.js (/api/extract-graph) + room.routes.js (/api/room/:roomId)
src/controllers/ graph.controller.js · room.controller.js
src/services/    extraction    Groq call + retry · research (Jina Reader) · format (→ React Flow) · persistence (Supabase) · mock
src/prompts/     extractGraph.prompt.js   SYSTEM_PROMPT + buildUserPrompt
src/schemas/     graph.schema.js          request + LLM output schemas
src/middleware/  validate · rateLimit · errorHandler
src/utils/       parseLLMJson · sanitizeGraph · mergeGraphs (rooms) · layout (dagre) · slug · logger
scripts/         smoke.js · pipeline.test.js · research.test.js · room.test.js
supabase/        schema.sql
```
