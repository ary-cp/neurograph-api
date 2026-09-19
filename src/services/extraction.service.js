import { groq } from '../config/groq.js'
import { env } from '../config/env.js'
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/extractGraph.prompt.js'
import { llmGraphSchema } from '../schemas/graph.schema.js'
import { parseLLMJson } from '../utils/parseLLMJson.js'
import { AppError } from '../middleware/errorHandler.js'
import { logger } from '../utils/logger.js'
import { mockGraph } from './mock.service.js'
import { researchText } from './research.service.js'

const MAX_ATTEMPTS = 2

/**
 * text → { graph: { nodes, edges }, meta }
 *
 * 1. Live Web Research: every http(s) link in the note is fetched through Jina Reader and its
 *    Markdown is handed to the model as source material (fail-soft — see research.service.js).
 * 2. One Groq call in JSON mode; if the output fails to parse/validate we feed the error back once.
 */
export async function extractGraph({ text, existingNodes = [] }) {
  const research = await researchText(text)
  const sources = research.filter((r) => r.ok)
  // echo what happened back to the client, minus the page bodies
  const researchMeta = research.map(({ content, ...rest }) => rest)

  if (env.MOCK_LLM) {
    return { graph: mockGraph(text), meta: { model: 'mock', attempt: 1, latencyMs: 0, mock: true, research: researchMeta } }
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(text, existingNodes, sources) },
  ]

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now()
    let raw = ''
    let usage

    try {
      const completion = await groq.chat.completions.create({
        model: env.GROQ_MODEL,
        messages,
        temperature: 0.2, // extraction, not creativity
        max_tokens: 2048,
        response_format: { type: 'json_object' }, // Groq JSON mode (prompt must mention "JSON" — it does)
      })
      raw = completion.choices?.[0]?.message?.content ?? ''
      usage = completion.usage
    } catch (err) {
      // JSON mode rejects malformed output with 400 json_validate_failed and returns the raw text —
      // we can often still salvage it with our own lenient parser.
      const failed = err?.error?.error?.failed_generation ?? err?.error?.failed_generation
      if (failed) raw = failed
      else if (err?.status === 429) throw new AppError(429, 'Groq rate limit hit — retry in a few seconds', { cause: err })
      else if (err?.status === 413 || /context|too large|tokens/i.test(err?.message ?? ''))
        throw new AppError(413, 'That note plus its linked page is too long for the model — lower RESEARCH_MAX_CHARS or trim the note', { cause: err })
      else if (err?.status >= 400 && err?.status < 500) throw new AppError(502, `Groq rejected the request: ${err.message}`, { cause: err })
      else throw new AppError(503, 'Groq is unreachable right now', { cause: err })
    }

    try {
      const graph = llmGraphSchema.parse(parseLLMJson(raw))
      return {
        graph,
        meta: {
          model: env.GROQ_MODEL,
          attempt,
          latencyMs: Date.now() - started,
          tokens: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens } : undefined,
          mock: false,
          research: researchMeta,
        },
      }
    } catch (err) {
      lastError = err
      logger.warn(`extract-graph attempt ${attempt} invalid: ${describe(err)}`)
      messages.push(
        { role: 'assistant', content: raw || '{}' },
        {
          role: 'user',
          content: `That output was invalid (${describe(err)}). Reply with ONLY the corrected JSON object matching the schema. No commentary.`,
        },
      )
    }
  }

  throw new AppError(502, 'The model could not produce a valid graph for this text', { cause: lastError })
}

function describe(err) {
  if (Array.isArray(err?.issues)) {
    return err.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ')
  }
  return err?.message ?? String(err)
}
