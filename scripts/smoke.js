// Quick end-to-end check against a running server:  npm run smoke  [-- "your text here"]
const BASE = process.env.API_URL ?? 'http://localhost:4000'
const text =
  process.argv.slice(2).join(' ') ||
  'Switching to remote work made our team more productive, but design reviews got worse because nobody whiteboards anymore. Priya thinks we should go hybrid.'

console.log('health:', await fetch(`${BASE}/api/health`).then((r) => r.json()))

const res = await fetch(`${BASE}/api/extract-graph`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, existingNodes: [{ id: 'n2', label: 'Boosts Productivity', kind: 'Claim' }] }),
})
const body = await res.json()
console.log(`\nHTTP ${res.status}`, JSON.stringify(body.stats ?? body), '\n')
for (const n of body.nodes ?? []) console.log(` ● ${n.data.kind.padEnd(8)} ${n.data.label}  @(${n.position.x}, ${n.position.y})`)
for (const e of body.edges ?? []) console.log(` ${e.data.gap ? '⚡' : '→'} ${e.source} —[${e.data.relation}]→ ${e.target}  (${e.data.confidence})`)
console.log('\nmeta:', body.meta)
