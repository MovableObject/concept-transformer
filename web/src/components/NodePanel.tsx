// The selected node's title and what it does, at the top of the map, like Houdini's parameter pane header. The
// everyday controls live on the nodes themselves; only a move's extra boxes (target domain, rule, ...) are set here.
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { labelOf, moveById } from '@/lib/api'
import { runNodes } from '@/lib/cook'
import { stateOf } from '@/lib/graph'
import type { MoveField } from '@/lib/types'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { MoveIcon, groupColor } from './MoveIcon'

/** A move's extra box; saves when you stop typing or leave it (so each keystroke does not make an undo step). */
function FieldBox({ id, def, value, which }: { id: string; def: MoveField; value: string; which: 'field' | 'field2' }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value, id])
  const save = () => { if (v !== value) useGraph.getState().setParam(id, { [which]: v.slice(0, def.max) }) }
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{def.label}{def.optional ? ' (optional)' : ''}</span>
      <Input value={v} maxLength={def.max} placeholder={def.placeholder || def.label} className="h-7 min-w-0 text-sm"
        onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
    </label>
  )
}

const KIND_HELP: Record<string, [string, string]> = {
  concept: ['Concept', 'Double-click the box to change it. Tab, or dragging from the dot under it, adds a transform wired to it.'],
  source: ['Source', 'A pasted passage. Only collisions take it: drop a wire from it onto another box.'],
  note: ['Note', 'A note for yourself; never sent anywhere. Double-click it to change it.'],
}

export function NodePanel() {
  useGraph((s) => s.version)
  const g = useGraph((s) => s.graph)
  const busy = useUI((u) => u.busy)
  const n = g.selected ? g.nodes[g.selected] : null
  if (!n) return null

  if (n.kind !== 'transform') {
    const [title, help] = KIND_HELP[n.kind]
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] text-muted-foreground">{help}</span>
      </div>
    )
  }

  const t = n
  const def = moveById(t.moveIds[0])
  const state = stateOf(g, t.id)
  const name = t.moveIds.length > 1 ? t.moveIds.map((m) => labelOf(moveById(m), t.mode)).join(' + ') : labelOf(def, t.mode) || 'Unknown move'
  const status = state === 'new' ? 'not run yet' : state === 'stale' ? 'changed since it ran' : state === 'working' ? 'running\u2026'
    : state === 'error' ? 'failed' : state === 'bypass' ? 'bypassed' : t.engine
  return (
    <div className="space-y-1.5 border-b border-border px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {t.moveIds.map((m) => <MoveIcon key={m} id={m} className="size-6" />)}
        <span className="text-[15px] font-semibold" style={{ color: groupColor(def?.group) }}>{name}</span>
        <span className="text-[12px] text-muted-foreground">{status}</span>
        <Button size="sm" className="ml-auto h-7" disabled={busy || !!t.bypass} onClick={() => runNodes([t.id])} title="Run this transform (R)">
          <Play />{state === 'done' ? 'Run again' : 'Run'}
        </Button>
      </div>
      {def && <p className="text-[13px] text-muted-foreground">{def.blurb[t.mode]}</p>}
      {state === 'error' && t.error && <p className="text-[13px] text-destructive">{t.error}</p>}
      {(t.note || t.card) && (
        <p className="text-[12px] text-muted-foreground">{t.card ? `Card drawn: \u201c${t.card}\u201d. ` : ''}{t.note}</p>
      )}
      {(def?.field && !def.deck) || def?.field2 ? (
        <div className="flex flex-wrap gap-3">
          {def?.field && !def.deck && <FieldBox id={t.id} def={def.field} value={t.field} which="field" />}
          {def?.field2 && <FieldBox id={t.id} def={def.field2} value={t.field2} which="field2" />}
        </div>
      ) : null}
    </div>
  )
}
