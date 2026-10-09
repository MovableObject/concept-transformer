// The change view: a word-level diff (longest common subsequence) of a result against the concept it came from.
// Removed words show struck and dim, added words bold; a leading "[tag]" is shown after the result, outside the diff.

export const TAG_RE = /^\s*\[[^\]]*\]\s*/

export function splitTag(text: string): { body: string; tag: string } {
  const m = text.match(TAG_RE)
  return m ? { body: text.slice(m[0].length).trim(), tag: m[0].trim() } : { body: text.trim(), tag: '' }
}

const norm = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

export type DiffPart = { w: string; k: 'same' | 'add' | 'del' }

export function wordDiff(before: string, after: string): { parts: DiffPart[]; shared: number } {
  const a = before.split(/\s+/).filter(Boolean), b = after.split(/\s+/).filter(Boolean)
  const an = a.map(norm), bn = b.map(norm)
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = an[i] && an[i] === bn[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const parts: DiffPart[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (an[i] && an[i] === bn[j]) { parts.push({ w: b[j], k: 'same' }); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) { parts.push({ w: a[i], k: 'del' }); i++ }
    else { parts.push({ w: b[j], k: 'add' }); j++ }
  }
  while (i < a.length) parts.push({ w: a[i++], k: 'del' })
  while (j < b.length) parts.push({ w: b[j++], k: 'add' })
  return { parts, shared: a.length ? L[0][0] / a.length : 0 }
}
