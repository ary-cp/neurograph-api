/**
 * Defensive JSON extraction for LLM output.
 * Handles: ```json fences, leading/trailing chatter, trailing commas.
 */
export function parseLLMJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('empty model output')

  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object found in model output')
  text = text.slice(start, end + 1)

  try {
    return JSON.parse(text)
  } catch {
    // Most common LLaMA slip: trailing commas before } or ]
    return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'))
  }
}
