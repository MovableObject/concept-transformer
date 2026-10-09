// Taste memory (phase 4): the visitor's newest keeps and discards, sent with each press so the engine can aim at
// what they keep and away from what they throw out. Stored only in this browser; never kept on the server.
import { useGraph } from '@/store/graph'

const MAX_KEPT = 8, MAX_DISCARDED = 12

export function tasteLists(): { kept: string[]; discarded: string[] } {
  const g = useGraph.getState().graph
  const byTime = g.order.map((k) => g.nodes[k]).filter((n) => n.kind === 'concept' && n.verdict)
    .sort((a, b) => a.time - b.time)
  const clip = (t: string) => (t.length > 220 ? t.slice(0, 217) + '…' : t)
  return {
    kept: byTime.filter((n) => n.kind === 'concept' && n.verdict === 'kept').slice(-MAX_KEPT).map((n) => clip(n.kind === 'concept' ? n.plain : '')),
    discarded: byTime.filter((n) => n.kind === 'concept' && n.verdict === 'discarded').slice(-MAX_DISCARDED).map((n) => clip(n.kind === 'concept' ? n.plain : '')),
  }
}
