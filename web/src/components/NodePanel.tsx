// The parameter pane, as in Houdini: everything about the selected node, on the right of the graph, so the nodes
// themselves stay small. It folds away to a thin strip.
import { useEffect, useState } from 'react'
import { ArrowDown, PanelRightClose, Pencil, PanelRightOpen, Play, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { labelOf, moveById, subOf, useMoves } from '@/lib/api'
import { runNodes } from '@/lib/cook'
import { addMove } from '@/lib/actions'
import { suggestNext } from '@/lib/next'
import { outputOf, portsOf, stateOf, upstream } from '@/lib/graph'
import { speak, useSpeaking } from '@/lib/speak'
import type { MoveField, TransformBox } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useGraph } from '@/store/graph'
import { DEFAULT_WORDS, useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { MoveIcon, groupColor } from './MoveIcon'
import { HandSteps, MoveTip, handText } from './MoveGroups'
import { ModeTabs } from './SidePanel'

const rowLabel = 'w-20 shrink-0 text-right text-[12px] text-muted-foreground'

/** A move's extra box; saves when you stop typing or leave it (so each keystroke does not make an undo step). */
function FieldBox({ id, def, value, which }: { id: string; def: MoveField; value: string; which: 'field' | 'field2' }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value, id])
  const save = () => { if (v !== value) useGraph.getState().setParam(id, { [which]: v.slice(0, def.max) }) }
  return (
    <label className="flex items-center gap-2">
      <span className={rowLabel}>{def.label}</span>
      <Input value={v} maxLength={def.max} placeholder={def.optional ? 'optional' : def.placeholder || def.label} className="h-7 min-w-0 flex-1 text-sm"
        onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
    </label>
  )
}

function TextParam({ id, text, label }: { id: string; text: string; label: string }) {
  const [v, setV] = useState(text)
  useEffect(() => setV(text), [text, id])
  const save = () => { const c = v.replace(/[ \t]+/g, ' ').trim(); if (c && c !== text) { useGraph.getState().checkpoint(); useGraph.getState().setText(id, c) } }
  return <Textarea value={v} rows={5} aria-label={label} className="text-sm" onChange={(e) => setV(e.target.value)} onBlur={save} />
}

/** Type a result by hand: a new one, or a rewrite of an existing one. It passes on like a model result. */
function HandWrite({ id, index, start, onDone }: { id: string; index?: number; start?: string; onDone?: () => void }) {
  const [v, setV] = useState(start ?? '')
  useEffect(() => setV(start ?? ''), [id, index, start])
  const save = () => { if (!v.trim()) return; useGraph.getState().writeResult(id, v, index); if (index == null) setV(''); onDone?.() }
  return (
    <div className="space-y-1.5">
      <Textarea value={v} rows={3} className="text-sm" aria-label={index == null ? 'Write your own result' : 'Rewrite this result'}
        placeholder={index == null ? 'Write your own result, by hand. It passes on like any other.' : undefined}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } if (e.key === 'Escape' && onDone) onDone() }} />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7" disabled={!v.trim()} onClick={save} title="Use this as the result (Ctrl+Enter)">{index == null ? 'Use it' : 'Save'}</Button>
        {onDone && <Button size="sm" variant="ghost" className="h-7" onClick={onDone}>Cancel</Button>}
      </div>
    </div>
  )
}

function SpeakButton({ id, text, small }: { id: string; text: string; small?: boolean }) {
  const saying = useSpeaking((s) => s.key === id)
  if (small) {
    return (
      <button className={cn('flex size-6 items-center justify-center rounded-[3px] hover:bg-accent', saying ? 'text-primary' : 'text-muted-foreground')}
        disabled={!text} aria-label={saying ? 'Stop reading' : 'Read aloud'} title={saying ? 'Stop reading' : 'Read aloud'} onClick={() => speak(text, id)}>
        {saying ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </button>
    )
  }
  return (
    <Button size="sm" variant="outline" className="h-7" disabled={!text} onClick={() => speak(text, id)}>
      {saying ? <VolumeX /> : <Volume2 />}{saying ? 'Stop' : 'Read aloud'}
    </Button>
  )
}

/** "Good next step", folded: two or three transforms to try next, each with the reason, read off the path above. */
function NextSteps({ id }: { id: string }) {
  const g = useGraph.getState().graph
  const list = suggestNext(g, id)
  if (!list.length) return null
  const mode = useSettings.getState().mode
  return (
    <details className="group rounded-[4px] border border-border px-2.5 py-1.5 text-[13px]">
      <summary className="cursor-pointer select-none text-[12px] font-semibold text-muted-foreground group-open:mb-1.5">Good next step</summary>
      <div className="space-y-1.5">
        {list.map((s) => {
          const m = moveById(s.moveId)
          if (!m) return null
          return (
            <button key={s.moveId} className="flex w-full items-start gap-2 rounded-[4px] border border-border px-2 py-1.5 text-left hover:border-primary"
              title="Add it, wired in. Nothing runs until you press Run." onClick={() => addMove(s.moveId, { inputs: s.inputs })}>
              <MoveIcon id={s.moveId} className="mt-0.5 size-4 shrink-0" />
              <span><span className="font-semibold" style={{ color: groupColor(m.group) }}>{labelOf(m, mode)}</span>
                <span className="block text-[12px] text-muted-foreground">{s.reason}</span></span>
            </button>
          )
        })}
        <p className="text-[11px] text-muted-foreground">A leap, then a change of form or viewpoint, works best. Chains that leave the input drift.</p>
      </div>
    </details>
  )
}

const KIND_HELP: Record<string, [string, string]> = {
  concept: ['Concept', 'Wire it into a transform: Tab with it selected, or drag from the dot under it.'],
  source: ['Source', 'A pasted passage. Only collisions take it: drop a wire from it onto another box.'],
  note: ['Note', 'A note for yourself; never sent anywhere.'],
}

function Body() {
  useGraph((s) => s.version)
  useMoves((s) => s.moves)   // the move list loads after the map; redraw when it lands
  useSettings((s) => s.naming)
  const g = useGraph((s) => s.graph)
  const busy = useUI((u) => u.busy)
  const n = g.selected ? g.nodes[g.selected] : null
  const [editing, setEditing] = useState<number | null>(null)
  useEffect(() => setEditing(null), [g.selected])

  if (!n) return <p className="p-4 text-[13px] text-muted-foreground">Select a node to see its parameters here.</p>

  if (n.kind !== 'transform') {
    const [title, help] = KIND_HELP[n.kind]
    return (
      <div className="space-y-3 p-4">
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="text-[13px] text-muted-foreground">{help}</p>
        <TextParam id={n.id} text={n.text} label={title} />
        <SpeakButton id={n.id} text={n.text} />
        {n.kind === 'concept' && <NextSteps id={n.id} />}
      </div>
    )
  }

  const t = n as TransformBox
  const def = moveById(t.moveIds[0])
  const state = stateOf(g, t.id)
  const handStale = state === 'stale' && !!t.results[t.shown]?.hand
  const name = t.moveIds.length > 1 ? t.moveIds.map((m) => labelOf(moveById(m), t.mode)).join(' + ') : labelOf(def, t.mode) || 'Unknown move'
  const status = state === 'new' ? 'not run yet' : handStale ? 'something above changed since you wrote this; Run all leaves it alone' : state === 'stale' ? 'changed since it ran' : state === 'working' ? 'running…'
    : state === 'error' ? 'failed' : state === 'bypass' ? 'bypassed' : t.engine
  const words = t.words || DEFAULT_WORDS[t.mode]
  const ports = portsOf(t, def)
  const depth = upstream(g, t.id).length + 1
  const store = useGraph.getState()
  return (
    <div className="space-y-3 p-4">
      {def?.hand && (
        <details className="group rounded-[4px] border border-border px-2.5 py-1.5 text-[13px]">
          <summary className="cursor-pointer select-none text-[12px] font-semibold text-muted-foreground group-open:mb-1.5">Do it by hand</summary>
          <div className="space-y-2 text-muted-foreground">
            <HandSteps m={def} mode={t.mode} />
            <SpeakButton id={`${t.id}:hand`} text={handText(def, t.mode)} />
          </div>
        </details>
      )}
      <div className="flex items-center gap-2">
        {t.moveIds.map((m) => <MoveIcon key={m} id={m} className="size-6" />)}
        <span className="min-w-0"><span className="text-[15px] font-semibold" style={{ color: groupColor(def?.group) }}>{name}</span>{subOf(def, t.mode) && <span className="block text-[12px] text-muted-foreground">{subOf(def, t.mode)}</span>}</span>
        <Button size="sm" className="ml-auto h-7" disabled={busy || !!t.bypass} onClick={() => runNodes([t.id])} title="Run this transform (R)">
          <Play />{state === 'done' ? 'Run again' : 'Run'}
        </Button>
      </div>
      <p className={cn('text-[12px]', state === 'error' ? 'text-destructive' : state === 'stale' ? 'text-amber-400' : 'text-muted-foreground')}>
        {state === 'error' && t.error ? t.error : status}
      </p>
      {def && <div className="text-[13px] text-muted-foreground"><MoveTip m={def} mode={t.mode} sub={false} /></div>}
      {(t.note || t.card) && <p className="text-[12px] text-muted-foreground">{t.card ? `Card drawn: “${t.card}”. ` : ''}{t.note}</p>}

      <div className="space-y-2.5 border-t border-border pt-3">
        <div className="flex items-center gap-2"><span className={rowLabel}>Gives</span><ModeTabs size="xs" value={t.mode} onChange={(m) => store.setParam(t.id, { mode: m })} /></div>
        <div className="flex items-center gap-2">
          <span className={rowLabel}>Length</span>
          <Slider min={5} max={60} step={1} value={[words]} aria-label="Length of results" className="flex-1"
            onPointerDown={() => store.checkpoint()} onValueChange={([v]) => store.setParam(t.id, { words: v }, false)} />
          <span className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{words} words</span>
        </div>
        {def?.field && !def.deck && <FieldBox id={t.id} def={def.field} value={t.field} which="field" />}
        {def?.field2 && <FieldBox id={t.id} def={def.field2} value={t.field2} which="field2" />}
        <label className="flex items-center gap-2">
          <span className={rowLabel}>Bypass</span>
          <Switch checked={!!t.bypass} onCheckedChange={(v) => store.setParam(t.id, { bypass: v || undefined })} aria-label="Bypass" />
          <span className="text-[12px] text-muted-foreground"><ArrowDown className="mr-1 inline size-3 text-pink-400" />pass the input straight through (B)</span>
        </label>
        <label className="flex items-center gap-2">
          <span className={rowLabel}>Display</span>
          <Switch checked={g.display === t.id} onCheckedChange={(v) => store.setDisplay(v ? t.id : null)} aria-label="Display flag" />
          <span className="text-[12px] text-muted-foreground">Cook runs the chain down to here (D)</span>
        </label>
        {Array.from({ length: ports }, (_, i) => {
          const src = t.inputs[i]
          const txt = src ? outputOf(g, src) : ''
          return (
            <div key={i} className="flex gap-2 text-[12px]">
              <span className={rowLabel}>{ports === 2 ? `Input ${i ? 'B' : 'A'}` : 'Input'}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">{src && g.nodes[src] ? (txt ? txt.slice(0, 160) : 'no text yet') : 'not wired'}</span>
            </div>
          )
        })}
      </div>

      {!t.bypass && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Results: the chosen one passes on</div>
          <p className="text-[11px] text-muted-foreground">The thumbs never rerun anything: they tell later runs on this map what to aim for and what to avoid.</p>
          {t.results.map((r, i) => editing === i ? (
            <div key={i} className="rounded-[4px] border border-primary px-2.5 py-2"><HandWrite id={t.id} index={i} start={r.plain} onDone={() => setEditing(null)} /></div>
          ) : (
            <div key={i} className={cn('rounded-[4px] border px-2.5 py-2 text-[13px] leading-snug', i === t.shown ? 'border-primary bg-primary/10' : 'border-border')}>
              <button className="block w-full text-left" onClick={() => store.show(t.id, i)} title="Use this result as the output (N steps through them)">
                {r.plain}{r.tag && <span className="text-muted-foreground"> {r.tag}</span>}
              </button>
              <div className="mt-1.5 flex items-center gap-1">
                {r.hand && <span className="mr-1 text-[11px] text-muted-foreground">by hand</span>}
                {(['kept', 'discarded'] as const).map((v) => (
                  <button key={v} className={cn('flex size-6 items-center justify-center rounded-[3px] hover:bg-accent',
                    r.verdict === v ? (v === 'kept' ? 'text-primary' : 'text-destructive') : 'text-muted-foreground')}
                    aria-label={v === 'kept' ? 'Aim for more like this' : 'Steer away from this'} aria-pressed={r.verdict === v}
                    title={v === 'kept' ? 'Aim for more like this: later runs on this map are told you liked this kind of idea (K)' : 'Steer away from this: later runs on this map are told to avoid this kind of idea (X)'}
                    onClick={() => store.update((gg) => { const tt = gg.nodes[t.id]; if (tt?.kind === 'transform' && tt.results[i]) tt.results[i].verdict = r.verdict === v ? undefined : v }, { undo: true })}>
                    {v === 'kept' ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
                  </button>
                ))}
                <SpeakButton small id={`${t.id}:${i}`} text={r.tag ? `${r.plain} ${r.tag}` : r.plain} />
                <button className="flex size-6 items-center justify-center rounded-[3px] text-muted-foreground hover:bg-accent"
                  aria-label="Rewrite by hand" title="Rewrite this result by hand" onClick={() => setEditing(i)}><Pencil className="size-3.5" /></button>
              </div>
            </div>
          ))}
          <div className="pt-1"><HandWrite id={t.id} /></div>
        </div>
      )}
      {!t.bypass && <NextSteps id={t.id} />}
      {depth >= 4 && <p className="text-[12px] text-muted-foreground">This chain is {depth} transforms long. Long chains tend to drift; a collision, or finishing it with Visualize, usually works better.</p>}
    </div>
  )
}

export function NodePanel() {
  const open = useSettings((s) => s.params)
  const set = useSettings((s) => s.set)
  if (!open) {
    return (
      <aside className="flex flex-col items-center border-l border-border py-3 max-md:hidden" aria-label="Parameters">
        <Button size="icon" variant="ghost" aria-label="Show the parameters" title="Show the parameters of the selected node" onClick={() => set({ params: true })}><PanelRightOpen /></Button>
      </aside>
    )
  }
  return (
    <aside className="flex min-h-0 flex-col border-l border-border max-md:border-l-0 max-md:border-t" aria-label="Parameters">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Parameters</span>
        <Button size="icon" variant="ghost" className="size-7" aria-label="Fold the parameters away" title="Fold the parameters away" onClick={() => set({ params: false })}><PanelRightClose /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto"><Body /></div>
    </aside>
  )
}
