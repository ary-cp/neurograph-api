/** djb2 → base36, used to build stable ids for non-ASCII labels. */
export function shortHash(s) {
  let h = 5381
  for (const ch of String(s)) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0
  return h.toString(36).slice(0, 6)
}

/** "Remote Work!" → "remote_work". Falls back when nothing ASCII survives (e.g. Devanagari). */
export function slugify(s, fallback = 'node') {
  const out = String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return out || fallback
}
