// The parameter pane, as in Houdini: everything about the selected node, on the right of the graph, so the nodes
// themselves stay small. It folds away to a thin strip.
import { useEffect, useState } from 'react'
import { ArrowDown, PanelRightClose, PanelRightOpen, Play, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { labelOf, moveById } from '@/lib/api'
import { runNodes } from '@/lib/cook'
import { outputOf, portsOf, stateOf, upstream } from '@/lib/graph'
import { speak, useSpeaking } from '@/lib/speak'
import type { MoveField, TransformBox } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useGraph } from '@/store/graph'
import { DEFAULT_WORDS, useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { MoveIcon, groupColor } from './MoveIcon'
import { MoveTip } from './MoveGroups'
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

const KIND_HELP: Record<string, [string, string]> = {
  concept: ['Concept', 'Wire it into a transform: Tab with it selected, or drag from the dot under it.'],
  source: ['Source', 'A pasted passage. Only collisions take it: drop a wire from it onto another box.'],
  note: ['Note', 'A note for yourself; never sent anywhere.'],
}

function Body() {
  useGraph((s) => s.version)
  const g = useGraph((s) => s.graph)
  const busy = useUI((u) => u.busy)
  const n = g.selected ? g.nodes[g.selected] : null

  if (!n) return <p className="p-4 text-[13px] text-muted-foreground">Select a node to see its parameters here.</p>

  if (n.kind !== 'transform') {
    const [title, help] = KIND_HELP[n.kind]
    return (
      <div className="space-y-3 p-4">
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="text-[13px] text-muted-foreground">{help}</p>
        <TextParam id={n.id} text={n.text} label={title} />
        <SpeakButton id={n.id} text={n.text} />
      </div>
    )
  }

  const t = n as TransformBox
  const def = moveById(t.moveIds[0])
  const state = stateOf(g, t.id)
  const name = t.moveIds.length > 1 ? t.moveIds.map((m) => labelOf(moveById(m), t.mode)).join(' + ') : labelOf(def, t.mode) || 'Unknown move'
  const status = state === 'new' ? 'not run yet' : state === 'stale' ? 'changed since it ran' : state === 'working' ? 'running…'
    : state === 'error' ? 'failed' : state === 'bypass' ? 'bypassed' : t.engine
  const words = t.words || DEFAULT_WORDS[t.mode]
  const ports = portsOf(t, def)
  const depth = upstream(g, t.id).length + 1
  const store = useGraph.getState()
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        {t.moveIds.map((m) => <MoveIcon key={m} id={m} className="size-6" />)}
        <span className="text-[15px] font-semibold" style={{ color: groupColor(def?.group) }}>{name}</span>
        <Button size="sm" className="ml-auto h-7" disabled={busy || !!t.bypass} onClick={() => runNodes([t.id])} title="Run this transform (R)">
          <Play />{state === 'done' ? 'Run again' : 'Run'}
        </Button>
      </div>
      <p className={cn('text-[12px]', state === 'error' ? 'text-destructive' : state === 'stale' ? 'text-amber-400' : 'text-muted-foreground')}>
        {state === 'error' && t.error ? t.error : status}
      </p>
      {def && <div className="text-[13px] text-muted-foreground"><MoveTip m={def} mode={t.mode} /></div>}
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
          <span className="text-[12px] text-muted-foreground"><ArrowDown className="mr-1 inline size-3 text-amber-400" />pass the input straight through (B)</span>
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

      {t.results.length > 0 && !t.bypass && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Results: the chosen one passes on</div>
          {t.results.map((r, i) => (
            <div key={i} className={cn('rounded-[4px] border px-2.5 py-2 text-[13px] leading-snug', i === t.shown ? 'border-primary bg-primary/10' : 'border-border')}>
              <button className="block w-full text-left" onClick={() => store.show(t.id, i)} title="Use this result as the output (N steps through them)">
                {r.plain}{r.tag && <span className="text-muted-foreground"> {r.tag}</span>}
              </button>
              <div className="mt-1.5 flex items-center gap-1">
                {(['kept', 'discarded'] as const).map((v) => (
                  <button key={v} className={cn('flex size-6 items-center justify-center rounded-[3px] hover:bg-accent',
                    r.verdict === v ? (v === 'kept' ? 'text-primary' : 'text-destructive') : 'text-muted-foreground')}
                    aria-label={v === 'kept' ? 'Keep' : 'Discard'} aria-pressed={r.verdict === v}
                    title={v === 'kept' ? 'Keep: later runs aim for ideas like this (K)' : 'Discard: later runs steer away from ideas like this (X)'}
                    onClick={() => store.update((gg) => { const tt = gg.nodes[t.id]; if (tt?.kind === 'transform' && tt.results[i]) tt.results[i].verdict = r.verdict === v ? undefined : v }, { undo: true })}>
                    {v === 'kept' ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
                  </button>
                ))}
                <SpeakButton small id={`${t.id}:${i}`} text={r.tag ? `${r.plain} ${r.tag}` : r.plain} />
              </div>
            </div>
          ))}
        </div>
      )}
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
