// The map as text: each concept or source, then the transforms wired from it, each with the result it passes on.
import { Copy, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { labelOf, moveById } from '@/lib/api'
import { outputFull, stateOf } from '@/lib/graph'
import { cn } from '@/lib/utils'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import type { Graph } from '@/lib/types'
import { MoveIcon } from './MoveIcon'

interface Line { depth: number; id: string; kind: 'concept' | 'source' | 'note' | 'transform'; name: string; text: string; tag: string }

function lines(g: Graph): Line[] {
  const out: Line[] = []
  const seen = new Set<string>()
  const memo = new Map()
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = g.nodes[id]
    if (!n) return
    if (n.kind === 'transform') {
      const s = stateOf(g, id, memo)
      const name = n.moveIds.map((m) => labelOf(moveById(m), n.mode)).join(' + ') || 'Unknown move'
      const tag = [n.results.length > 1 ? `result ${n.shown + 1} of ${n.results.length}` : '', s === 'new' ? 'not run yet' : s === 'stale' ? 'changed since it ran' : s === 'error' ? 'failed' : s === 'bypass' ? 'bypassed' : '',
        n.inputs.filter(Boolean).length > 1 ? 'collision' : ''].filter(Boolean).join(' · ')
      out.push({ depth, id, kind: 'transform', name, text: outputFull(g, id), tag })
    } else {
      out.push({ depth, id, kind: n.kind, name: n.kind === 'source' ? 'Source' : n.kind === 'note' ? 'Note' : '', text: n.text, tag: '' })
    }
    for (const k of g.order) {
      const t = g.nodes[k]
      if (t.kind === 'transform' && t.inputs.includes(id)) walk(k, depth + 1)
    }
  }
  for (const k of g.order) if (g.nodes[k].kind !== 'transform') walk(k, 0)
  for (const k of g.order) walk(k, 0)   // transforms with no inputs
  return out
}

export const outlineText = (g: Graph) => lines(g)
  .map((l) => `${'  '.repeat(l.depth)}${l.kind === 'transform' ? `→ ${l.name}: ` : '- '}${l.text}${l.tag ? ` (${l.tag})` : ''}`).join('\n')

export function Outline() {
  const g = useGraph((s) => s.graph)
  const ls = lines(g)
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); useUI.getState().toast('Copied.') } catch { /* ignore */ } }
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3"><Button size="sm" variant="outline" disabled={!ls.length} onClick={() => void copy(outlineText(g))}><Copy />Copy all</Button></div>
      {!ls.length && <p className="text-sm text-muted-foreground">Nothing on the map yet.</p>}
      <div className="divide-y divide-border rounded-[4px] border border-border bg-card px-3">
        {ls.map((l, i) => {
          const n = g.nodes[l.id]
          return (
            <div key={l.id + i} className={cn('flex flex-wrap items-baseline gap-2 py-1.5', l.id === g.selected && 'bg-primary/10')} style={{ paddingLeft: l.depth * 22 }}>
              <button className="flex min-w-0 items-baseline gap-1.5 text-left" onClick={() => useGraph.getState().select(l.id)}>
                {n?.kind === 'transform' && <span className="self-center"><MoveIcon id={n.moveIds[0]} /></span>}
                {l.name && <span className={cn('shrink-0 text-[13px] font-semibold', n?.kind === 'transform' ? 'text-chart-1' : 'text-muted-foreground')}>{l.name}{l.text ? ':' : ''}</span>}
                <span className={cn('text-[15px]', l.kind === 'source' && 'italic text-muted-foreground', l.kind === 'note' && 'text-muted-foreground')}>{l.text || (l.kind === 'transform' ? '' : 'empty')}</span>
              </button>
              {l.tag && <span className="text-xs text-muted-foreground">{l.tag}</span>}
              {l.text && (
                <span className="flex gap-1">
                  <Button size="xs" variant="ghost" onClick={() => void copy(l.text)} aria-label="Copy"><Copy /></Button>
                  <Button size="xs" variant="ghost" onClick={() => { const u = new SpeechSynthesisUtterance(l.text); window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(u) }} aria-label="Read aloud"><Volume2 /></Button>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
