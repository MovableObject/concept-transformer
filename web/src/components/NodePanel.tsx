// The selected node's settings and actions, like Houdini's parameter pane.
import { useEffect, useState } from 'react'
import { Copy, EyeOff, Play, Plus, RotateCw, ThumbsDown, ThumbsUp, Trash2, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { labelOf, moveById } from '@/lib/api'
import { finish, openTabMenu } from '@/lib/actions'
import { runNodes } from '@/lib/cook'
import { outputFull, outputOf, portsOf, stateOf, upstream } from '@/lib/graph'
import type { MoveField, TransformBox } from '@/lib/types'
import { useGraph } from '@/store/graph'
import { DEFAULT_WORDS, useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { ChangeView } from './ChangeView'
import { MoveIcon, groupColor } from './MoveIcon'
import { ModeTabs } from './SidePanel'

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

/** A text setting that saves when you stop typing or leave the box (so each keystroke does not make a step). */
function FieldBox({ id, def, value, which }: { id: string; def: MoveField; value: string; which: 'field' | 'field2' }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value, id])
  const save = () => { if (v !== value) useGraph.getState().setParam(id, { [which]: v.slice(0, def.max) }) }
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{def.label}{def.optional ? ' (optional)' : ''}</span>
      <Input value={v} maxLength={def.max} placeholder={def.placeholder || def.label} className="h-8 text-sm"
        onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
    </label>
  )
}

function TextBox({ id, text, label }: { id: string; text: string; label: string }) {
  const [v, setV] = useState(text)
  useEffect(() => setV(text), [text, id])
  const save = () => { const c = v.replace(/[ \t]+/g, ' ').trim(); if (c && c !== text) { useGraph.getState().checkpoint(); useGraph.getState().setText(id, c) } }
  return <Textarea value={v} rows={3} aria-label={label} className="text-base" onChange={(e) => setV(e.target.value)} onBlur={save} />
}

function Actions({ id, text }: { id: string; text: string }) {
  const [saying, setSaying] = useState<string | null>(null)
  return (
    <>
      <Button size="sm" variant="outline" disabled={!text} onClick={() => void copy(text)}><Copy />Copy</Button>
      <Button size="sm" variant="outline" disabled={!text} onClick={() => speak(text, id, setSaying)}><Volume2 />{saying === id ? 'Stop' : 'Read aloud'}</Button>
      <Button size="sm" variant="ghost" onClick={() => useGraph.getState().remove([id])}><Trash2 />Delete</Button>
    </>
  )
}

/** Open the add menu just right of the panel's button, wired to this node. */
function addAfter(e: React.MouseEvent, id: string) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  openTabMenu({ sx: r.left, sy: r.bottom + 6, inputs: [id] })
}

export function NodePanel() {
  useGraph((s) => s.version)
  const g = useGraph((s) => s.graph)
  const showChanges = useSettings((s) => s.showChanges)
  const busy = useUI((u) => u.busy)
  const n = g.selected ? g.nodes[g.selected] : null
  const store = useGraph.getState()
  const finisher = moveById('visualize')

  if (!n) {
    return g.order.length ? <div className="px-4 py-2 text-[13px] text-muted-foreground">Select a box to see its settings. Tab adds a node; Shift+R runs everything.</div> : null
  }

  if (n.kind !== 'transform') {
    const label = n.kind === 'concept' ? 'Concept' : n.kind === 'source' ? 'Source (only collisions take it)' : 'Note (never sent anywhere)'
    return (
      <div className="space-y-1.5 border-b border-border px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <TextBox id={n.id} text={n.text} label={label} />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {n.kind !== 'note' && <Button size="sm" onClick={(e) => addAfter(e, n.id)}><Plus />{n.kind === 'source' ? 'Collide with…' : 'Transform with…'}</Button>}
          {n.kind === 'concept' && finisher && (
            <Button size="sm" variant="secondary" disabled={busy || !n.text} title={finisher.blurb[useSettings.getState().mode]} onClick={() => finish(n.id)}>
              <MoveIcon id="visualize" />{labelOf(finisher, useSettings.getState().mode)}
            </Button>
          )}
          <Actions id={n.id} text={n.text} />
        </div>
      </div>
    )
  }

  const t = n as TransformBox
  const def = moveById(t.moveIds[0])
  const state = stateOf(g, t.id)
  const r = t.results[Math.min(t.shown, t.results.length - 1)]
  const ports = portsOf(t, def)
  const input0 = outputOf(g, t.inputs[0])
  const depth = upstream(g, t.id).length + 1
  const name = t.moveIds.length > 1 ? t.moveIds.map((m) => labelOf(moveById(m), t.mode)).join(' + ') : labelOf(def, t.mode) || 'Unknown move'
  const words = t.words || DEFAULT_WORDS[t.mode]
  const color = groupColor(def?.group)
  return (
    <div className="max-h-[46vh] space-y-2 overflow-y-auto border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {t.moveIds.map((m) => <MoveIcon key={m} id={m} className="size-6" />)}
        <span className="text-base font-semibold" style={{ color }}>{name}</span>
        <span className="text-[12px] text-muted-foreground">{
          state === 'new' ? 'not run yet' : state === 'stale' ? 'changed since it ran' : state === 'working' ? 'running…' : state === 'error' ? 'failed'
            : state === 'bypass' ? 'bypassed' : t.engine}</span>
        <Button size="sm" className="ml-auto" disabled={busy || !!t.bypass} onClick={() => runNodes([t.id])}>
          <Play />{state === 'done' ? 'Run again' : 'Run'}
        </Button>
      </div>
      {def && <p className="text-[13px] text-muted-foreground">{def.blurb[t.mode]}</p>}
      {t.error && state === 'error' && <p className="text-[13px] text-destructive">{t.error}</p>}
      {t.note && <p className="text-[13px] text-muted-foreground">{t.note}</p>}
      {t.card && <p className="text-[13px]"><span className="text-muted-foreground">Card drawn: </span>“{t.card}”</p>}

      {r && !t.bypass && (
        <div className="rounded-[4px] border border-border bg-card px-3 py-2">
          <div className="max-h-40 overflow-y-auto text-base leading-relaxed">
            <ChangeView before={input0} after={r.text} show={showChanges && !!input0} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.results.length > 1 && <Button size="sm" variant="outline" onClick={() => store.rotate(t.id)}><RotateCw />Next result ({t.shown + 1} of {t.results.length})</Button>}
            <Button size="sm" variant={r.verdict === 'kept' ? 'default' : 'outline'} title="Keep: later runs aim for ideas like this (K)"
              onClick={() => store.setVerdict(t.id, r.verdict === 'kept' ? undefined : 'kept')}><ThumbsUp />{r.verdict === 'kept' ? 'Kept' : 'Keep'}</Button>
            <Button size="sm" variant={r.verdict === 'discarded' ? 'secondary' : 'outline'} title="Discard: later runs steer away from ideas like this (X)"
              onClick={() => store.setVerdict(t.id, r.verdict === 'discarded' ? undefined : 'discarded')}><ThumbsDown />{r.verdict === 'discarded' ? 'Discarded' : 'Discard'}</Button>
            <Button size="sm" onClick={(e) => addAfter(e, t.id)}><Plus />Transform with…</Button>
            {finisher && t.moveIds[0] !== 'visualize' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => finish(t.id)}><MoveIcon id="visualize" />{labelOf(finisher, t.mode)}</Button>
            )}
          </div>
        </div>
      )}
      {depth >= 4 && <p className="text-[12px] text-muted-foreground">This chain is {depth} transforms long. Long chains tend to drift; a collision, or finishing it, usually works better.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gives</span>
          <ModeTabs size="xs" value={t.mode} onChange={(m) => store.setParam(t.id, { mode: m })} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Length</span>
            <span className="font-normal normal-case tracking-normal">up to {words} words{t.words ? '' : ' (default)'}</span>
          </div>
          <Slider min={5} max={60} step={1} value={[words]} aria-label="Length of results"
            onPointerDown={() => store.checkpoint()} onValueChange={([v]) => store.setParam(t.id, { words: v }, false)} />
        </div>
        {def?.field && !def.deck && <FieldBox id={t.id} def={def.field} value={t.field} which="field" />}
        {def?.field2 && <FieldBox id={t.id} def={def.field2} value={t.field2} which="field2" />}
      </div>

      <div className="text-[12px] text-muted-foreground">
        {Array.from({ length: ports }, (_, i) => {
          const src = t.inputs[i]
          const txt = src ? outputOf(g, src) : ''
          return (
            <div key={i} className="truncate">
              <b className="text-foreground">{ports === 2 ? `Input ${i ? 'B' : 'A'}` : 'Input'}:</b>{' '}
              {src && g.nodes[src] ? (txt ? txt.slice(0, 140) : 'no text yet') : 'not wired: drag from the dot under a box into the dot on top of this transform'}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={t.bypass ? 'default' : 'outline'} title="Bypass: pass the input straight through (B)"
          onClick={() => store.setParam(t.id, { bypass: !t.bypass || undefined })}><EyeOff />{t.bypass ? 'Bypassed' : 'Bypass'}</Button>
        <Actions id={t.id} text={outputFull(g, t.id)} />
      </div>
    </div>
  )
}
