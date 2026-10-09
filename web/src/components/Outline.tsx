// The map as text: each concept, the move that grew from it, and the result on show.
import { Copy, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resultsOf, shownResult, useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import type { Graph } from '@/lib/types'

interface Line { depth: number; id: string; kind: 'concept' | 'source' | 'transform'; text: string; tag: string }

function lines(g: Graph): Line[] {
  const out: Line[] = []
  const seen = new Set<string>()
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = g.nodes[id]
    if (!n) return
    if (n.kind === 'transform') {
      const r = shownResult(g, id)
      const c = r ? g.nodes[r] : null
      const opts = resultsOf(g, id).length
      const tag = [c && c.kind === 'concept' ? c.tag.replace(/^\[|\]$/g, '') : '', opts > 1 ? `option ${(n.shown || 0) + 1} of ${opts}` : '',
        n.parent2 ? 'collision' : ''].filter(Boolean).join(' · ')
      out.push({ depth, id, kind: 'transform', text: n.move, tag })
      if (r) walk(r, depth + 1)
      return
    }
    out.push({ depth, id, kind: n.kind, text: n.plain, tag: '' })
    for (const k of g.order) {
      const t = g.nodes[k]
      if (t.kind === 'transform' && (t.parent === id || t.parent2 === id)) walk(k, depth + 1)
    }
  }
  for (const k of g.order) if (!g.nodes[k].parent) walk(k, 0)
  return out
}

export const outlineText = (g: Graph) => lines(g)
  .map((l) => `${'  '.repeat(l.depth)}${l.kind === 'transform' ? '→ ' : '- '}${l.text}${l.tag ? ` (${l.tag})` : ''}`).join('\n')

export function Outline() {
  const g = useGraph((s) => s.graph)
  const ls = lines(g)
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); useUI.getState().toast('Copied.') } catch { /* ignore */ } }
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3"><Button size="sm" variant="outline" disabled={!ls.length} onClick={() => void copy(outlineText(g))}><Copy />Copy all</Button></div>
      {!ls.length && <p className="text-sm text-muted-foreground">Nothing on the map yet.</p>}
      <div className="divide-y divide-border rounded-[4px] border border-border bg-card px-3">
        {ls.map((l, i) => (
          <div key={l.id + i} className={cn('flex flex-wrap items-baseline gap-2 py-1.5', l.id === g.selected && 'bg-primary/10')} style={{ paddingLeft: l.depth * 22 }}>
            <button className={cn('text-left', l.kind === 'transform' ? 'text-[13px] font-semibold text-chart-1' : 'text-[15px]', l.kind === 'source' && 'italic text-muted-foreground')}
              onClick={() => useGraph.getState().select(l.id)}>
              {l.kind === 'transform' ? `→ ${l.text}` : l.text}
            </button>
            {l.tag && <span className="text-xs text-muted-foreground">{l.tag}</span>}
            {l.kind !== 'transform' && (
              <span className="flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => void copy(l.text)} aria-label="Copy"><Copy /></Button>
                <Button size="xs" variant="ghost" onClick={() => { const u = new SpeechSynthesisUtterance(l.text); window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(u) }} aria-label="Read aloud"><Volume2 /></Button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
