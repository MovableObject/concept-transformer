// The selected box in full, with what can be done to it.
import { useState } from 'react'
import { Copy, Flag, Pencil, Plus, RotateCw, ThumbsDown, ThumbsUp, Trash2, Volume2, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { labelOf, moveById, useMoves } from '@/lib/api'
import { runAgain, runMove } from '@/lib/press'
import type { TransformBox } from '@/lib/types'
import { resultsOf, useGraph } from '@/store/graph'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { ChangeView } from './ChangeView'

let speaking: string | null = null
function speak(text: string, key: string, set: (k: string | null) => void) {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  if (speaking === key) { speaking = null; set(null); return }
  const u = new SpeechSynthesisUtterance(text)
  u.onend = u.onerror = () => { if (speaking === key) { speaking = null; set(null) } }
  speaking = key; set(key)
  synth.speak(u)
}
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); useUI.getState().toast('Copied.') } catch { useUI.getState().toast('Could not copy.', 'error') }
}

/** How many moves deep a box is (the findings: one or two moves, then finish, usually beats long chains). */
function depthOf(id: string): number {
  const g = useGraph.getState().graph
  let d = 0, n = g.nodes[id]
  while (n && n.parent) {
    const t = g.nodes[n.parent]
    if (!t || !t.parent) break
    if (t.kind === 'transform') d++
    n = g.nodes[t.parent]
  }
  return d
}

export function NodePanel() {
  useGraph((s) => s.version)
  useMoves((s) => s.moves)
  const g = useGraph((s) => s.graph)
  const showChanges = useSettings((s) => s.showChanges)
  const mode = useSettings((s) => s.mode)
  const finisher = moveById('visualize')
  const busy = useUI((u) => u.busy)
  const [saying, setSaying] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const n = g.selected ? g.nodes[g.selected] : null
  const store = useGraph.getState()

  if (!n) {
    return g.order.length ? <div className="px-4 py-2 text-[13px] text-muted-foreground">Select a box to see it in full and to transform it.</div> : null
  }
  const del = () => { if (window.confirm('Delete this box and everything that grew from it?')) store.remove([n.id]) }

  if (n.kind === 'transform') {
    const t = n as TransformBox
    const total = resultsOf(g, t.id).length
    const blurb = t.moveIds.map(moveById).filter(Boolean).map((m) => m!.blurb[t.mode]).join(' ')
    return (
      <div className="space-y-1.5 border-b border-border px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.engine || 'Transform'}</div>
        <div className="text-base font-semibold text-chart-1">{t.move}</div>
        {blurb && <p className="text-[13px] text-muted-foreground">{blurb}</p>}
        {t.note && <p className="text-[13px] text-muted-foreground">{t.note}</p>}
        {t.status === 'error' && <p className="text-[13px] text-destructive">{t.error}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {t.moveIds.length > 0 && <Button size="sm" disabled={busy || t.status === 'working'} onClick={() => void runAgain(t)}><Repeat />Run again</Button>}
          {total > 1 && <Button size="sm" variant="outline" onClick={() => store.rotate(t.id)}><RotateCw />Next option ({(t.shown || 0) + 1} of {total})</Button>}
          <Button size="sm" variant="ghost" onClick={del}><Trash2 />Delete branch</Button>
        </div>
      </div>
    )
  }

  const t = n.parent ? (g.nodes[n.parent] as TransformBox) : null
  const src = t ? g.nodes[t.parent] : null
  const total = t ? resultsOf(g, t.id).length : 0
  const depth = depthOf(n.id)
  const fullText = n.kind === 'concept' && n.tag ? `${n.plain} ${n.tag}` : n.plain
  return (
    <div className="space-y-1.5 border-b border-border px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {n.kind === 'source' ? 'Source' : t ? `${t.move}${t.engine ? ' · ' + t.engine : ''}` : 'Typed concept'}
      </div>
      {editing === n.id ? (
        <div className="space-y-1.5">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="text-base" autoFocus />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => { store.editText(n.id, draft); setEditing(null) }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="max-h-40 overflow-y-auto text-base leading-relaxed">
          {n.kind === 'concept'
            ? <ChangeView before={src && src.kind !== 'transform' ? src.plain : ''} after={n.text} show={showChanges && !!src} />
            : <span className="italic text-muted-foreground">{n.plain}</span>}
        </div>
      )}
      {depth >= 3 && (
        <p className="text-[12px] text-muted-foreground">This branch is {depth} moves deep. Long chains tend to drift; colliding this with another box, or finishing it with {finisher ? labelOf(finisher, mode) : 'Visualize'}, usually works better.</p>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {n.kind === 'source'
          ? <p className="w-full text-[12px] text-muted-foreground">A source is for collisions: drag from the dot on its right onto another box.</p>
          : <Button size="sm" onClick={() => useUI.getState().set({ pickerFor: n.id })}><Plus />Transform this…</Button>}
        {n.kind === 'concept' && (
          <>
            {finisher && (
              <Button size="sm" variant="secondary" disabled={busy} title={finisher.blurb[mode]}
                onClick={() => void runMove('visualize', { parents: [n.id] })}><Flag />{labelOf(finisher, mode)}</Button>
            )}
            <Button size="sm" variant={n.verdict === 'kept' ? 'default' : 'outline'} title="Keep: the engine aims for ideas like this"
              onClick={() => store.setVerdict(n.id, n.verdict === 'kept' ? undefined : 'kept')}><ThumbsUp />{n.verdict === 'kept' ? 'Kept' : 'Keep'}</Button>
            <Button size="sm" variant={n.verdict === 'discarded' ? 'secondary' : 'outline'} title="Discard: the engine steers away from ideas like this"
              onClick={() => store.setVerdict(n.id, n.verdict === 'discarded' ? undefined : 'discarded')}><ThumbsDown />{n.verdict === 'discarded' ? 'Discarded' : 'Discard'}</Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => void copy(fullText)}><Copy />Copy</Button>
        <Button size="sm" variant="outline" onClick={() => speak(n.plain, n.id, setSaying)}><Volume2 />{saying === n.id ? 'Stop' : 'Read aloud'}</Button>
        {t && total > 1 && <Button size="sm" variant="outline" onClick={() => store.rotate(t.id)}><RotateCw />Next option ({(t.shown || 0) + 1} of {total})</Button>}
        <Button size="sm" variant="ghost" onClick={() => { setDraft(n.plain); setEditing(n.id) }}><Pencil />Edit</Button>
        <Button size="sm" variant="ghost" onClick={del}><Trash2 />Delete branch</Button>
      </div>
    </div>
  )
}
