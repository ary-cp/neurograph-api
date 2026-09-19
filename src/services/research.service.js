import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

/**
 * Live Web Research — any http(s) link inside a note is fetched through the Jina Reader API
 * (https://r.jina.ai/<url>) which returns the page as clean Markdown. The result is handed to
 * the LLM as source material next to the user's own words.
 *
 * Fail-soft by design: a dead link, timeout or Jina error never fails the request —
 * the note is analysed on its own and the failure is reported in meta.research[i].error.
 */
const JINA_READER = 'https://r.jina.ai/'
const TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 50
const cache = new Map() // url → { at, result }

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi
const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|::1)$/i

const count = (s, ch) => s.split(ch).length - 1

/** Pull up to `max` distinct, public http(s) URLs out of free text. */
export function extractUrls(text, max = env.RESEARCH_MAX_URLS) {
  const urls = []
  const seen = new Set()

  for (const match of String(text ?? '').matchAll(URL_RE)) {
    let raw = match[0].replace(/[.,;:!?'"”’»]+$/u, '') // punctuation that follows a link in prose
    // keep parentheses balanced (Wikipedia: /wiki/Python_(programming_language))
    while (raw.endsWith(')') && count(raw, '(') < count(raw, ')')) raw = raw.slice(0, -1)

    let u
    try {
      u = new URL(raw)
    } catch {
      continue
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    if (PRIVATE_HOST_RE.test(u.hostname)) continue

    if (seen.has(u.href)) continue
    seen.add(u.href)
    urls.push(u.href)
    if (urls.length >= max) break
  }
  return urls
}

/** Trim Jina's Markdown down to what the model needs: no images, no link URLs, bounded length. */
export function cleanMarkdown(md, maxChars = env.RESEARCH_MAX_CHARS) {
  let text = String(md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/\[\s*\]\([^)]*\)/g, '') // empty link remnants
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length <= maxChars) return { content: text, truncated: false }

  // cut at a paragraph boundary when one is reasonably close to the limit
  const cut = text.lastIndexOf('\n\n', maxChars)
  const at = cut > maxChars * 0.6 ? cut : maxChars
  return { content: `${text.slice(0, at).trimEnd()}\n\n[… truncated]`, truncated: true }
}

/**
 * GET https://r.jina.ai/<url> → { url, title, content, truncated, cached }
 * `fetchImpl` / `apiKey` are injectable for tests.
 */
export async function fetchReadable(url, { fetchImpl = fetch, apiKey = env.JINA_API_KEY, signal } = {}) {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.result, cached: true }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })

  const headers = {
    Accept: 'application/json', // → { data: { title, url, content } } instead of raw text
    'X-Return-Format': 'markdown',
    'X-Timeout': '10', // seconds Jina waits for the page itself
    'X-Remove-Selector': 'nav,footer,aside', // less boilerplate → fewer tokens
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}` // optional: without it Jina allows ~20 req/min

  try {
    const res = await fetchImpl(JINA_READER + url, { headers, signal: controller.signal })
    const type = res.headers.get('content-type') ?? ''
    const body = type.includes('application/json') ? await res.json() : { data: { content: await res.text() } }

    if (!res.ok) throw new Error(body?.readableMessage ?? body?.message ?? `Jina Reader responded ${res.status}`)

    const data = body?.data ?? {}
    const { content, truncated } = cleanMarkdown(data.content)
    if (!content) throw new Error('page returned no readable content')

    const result = { url: data.url || url, title: data.title || url, content, truncated, chars: content.length }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value) // FIFO eviction
    cache.set(url, { at: Date.now(), result })
    return { ...result, cached: false }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Research every link in a note, in parallel.
 * → [{ ok: true, url, title, content, truncated, chars, cached } | { ok: false, url, error }]
 */
export async function researchText(text, opts = {}) {
  if (!env.RESEARCH_ENABLED) return []
  const urls = extractUrls(text)
  if (!urls.length) return []

  const settled = await Promise.allSettled(urls.map((url) => fetchReadable(url, opts)))
  return settled.map((s, i) => {
    if (s.status === 'fulfilled') {
      logger.info(`research: ${urls[i]} → "${s.value.title}" (${s.value.chars} chars${s.value.cached ? ', cached' : ''})`)
      return { ok: true, ...s.value }
    }
    const error = s.reason?.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (s.reason?.message ?? String(s.reason))
    logger.warn(`research: ${urls[i]} failed — ${error}`)
    return { ok: false, url: urls[i], error }
  })
}
