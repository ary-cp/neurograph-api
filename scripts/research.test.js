// node --test — Live Web Research without touching the network (fetch is injected)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractUrls, cleanMarkdown, fetchReadable, researchText } from '../src/services/research.service.js'
import { buildUserPrompt } from '../src/prompts/extractGraph.prompt.js'

test('extractUrls: prose punctuation, Wikipedia parens, dedupe, private hosts, cap', () => {
  const text = `Read https://en.wikipedia.org/wiki/Python_(programming_language). Also (see https://example.com/a?x=1&y=2),
    again https://example.com/a?x=1&y=2 and http://localhost:3000/secret plus ftp://nope.org and https://10.0.0.5/admin
    then https://news.ycombinator.com/item?id=1 and https://one-too-many.com`
  assert.deepEqual(extractUrls(text, 3), [
    'https://en.wikipedia.org/wiki/Python_(programming_language)',
    'https://example.com/a?x=1&y=2',
    'https://news.ycombinator.com/item?id=1',
  ])
  assert.deepEqual(extractUrls('no links here'), [])
})

test('cleanMarkdown: strips images/link urls, collapses blank lines, truncates on a paragraph', () => {
  const md = 'Title\n\n\n\n![hero](https://x/y.png) See [the docs](https://x/docs) now.\n\n' + 'para '.repeat(300) + '\n\nlast para'
  const { content, truncated } = cleanMarkdown(md, 900)
  assert.ok(!content.includes('!['))
  assert.ok(content.includes('See the docs now.'))
  assert.ok(!content.includes('https://x/docs'))
  assert.ok(!content.includes('\n\n\n'))
  assert.equal(truncated, true)
  assert.ok(content.endsWith('[… truncated]'))
  assert.ok(content.length <= 900 + 20)
  assert.equal(cleanMarkdown('short').truncated, false)
})

const jinaJson = (data, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => (status < 400 ? { code: 200, status: 20000, data } : { code: status, message: 'nope', readableMessage: 'Jina says no' }),
  text: async () => '',
})

test('fetchReadable: hits r.jina.ai with Bearer key, returns title/content, caches', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return jinaJson({ title: 'Knowledge graph - Wikipedia', url: 'https://en.wikipedia.org/wiki/Knowledge_graph', content: '# KG\n\nA knowledge graph is...' })
  }
  const target = 'https://en.wikipedia.org/wiki/Knowledge_graph'
  const r1 = await fetchReadable(target, { fetchImpl, apiKey: 'jina_test_key' })
  assert.equal(calls[0].url, `https://r.jina.ai/${target}`)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jina_test_key')
  assert.equal(calls[0].init.headers.Accept, 'application/json')
  assert.equal(r1.title, 'Knowledge graph - Wikipedia')
  assert.match(r1.content, /^# KG/)
  assert.equal(r1.cached, false)

  const r2 = await fetchReadable(target, { fetchImpl, apiKey: 'jina_test_key' })
  assert.equal(r2.cached, true)
  assert.equal(calls.length, 1) // served from cache

  const noKey = []
  await fetchReadable('https://example.org/fresh', { fetchImpl: async (u, i) => (noKey.push(i), jinaJson({ title: 't', content: 'c' })), apiKey: '' })
  assert.equal(noKey[0].headers.Authorization, undefined)
})

test('researchText: one bad link does not sink the good one', async () => {
  const fetchImpl = async (url) =>
    url.includes('bad.example') ? jinaJson(null, 422) : jinaJson({ title: 'Good page', url: 'https://good.example/p', content: 'Good content' })
  const out = await researchText('compare https://good.example/p with https://bad.example/x', { fetchImpl, apiKey: '' })
  assert.equal(out.length, 2)
  assert.equal(out[0].ok, true)
  assert.equal(out[0].title, 'Good page')
  assert.equal(out[1].ok, false)
  assert.equal(out[1].error, 'Jina says no')
})

test('buildUserPrompt: research block appears only when sources exist', () => {
  const plain = buildUserPrompt('note', [])
  assert.ok(!plain.includes('WEB RESEARCH'))
  const rich = buildUserPrompt('note', [], [{ title: 'Good page', url: 'https://good.example/p', content: 'Good content' }])
  assert.ok(rich.includes('WEB RESEARCH'))
  assert.ok(rich.includes('SOURCE 1: Good page'))
  assert.ok(rich.indexOf('TEXT TO ANALYZE') < rich.indexOf('SOURCE 1'))
  assert.ok(rich.trim().endsWith('Return the JSON object now.'))
})
