// Taste memory: the visitor's newest keeps and discards (on transforms' results), sent with each run so the engine
// can aim at what they keep and away from what they throw out. Stored only in this browser; never kept on the server.
import { useGraph } from '@/store/graph'

const MAX_KEPT = 8, MAX_DISCARDED = 12

export function tasteLists(): { kept: string[]; discarded: string[] } {
  const g = useGraph.getState().graph
  const clip = (t: string) => (t.length > 220 ? t.slice(0, 217) + '…' : t)
  const kept: { t: number; s: string }[] = [], discarded: { t: number; s: string }[] = []
  for (const k of g.order) {
    const n = g.nodes[k]
    if (n.kind !== 'transform') continue
    for (const r of n.results) {
      if (r.verdict === 'kept') kept.push({ t: n.time, s: clip(r.plain) })
      if (r.verdict === 'discarded') discarded.push({ t: n.time, s: clip(r.plain) })
    }
  }
  const newest = (a: { t: number; s: string }[], max: number) => a.sort((x, y) => x.t - y.t).slice(-max).map((x) => x.s)
  return { kept: newest(kept, MAX_KEPT), discarded: newest(discarded, MAX_DISCARDED) }
}
