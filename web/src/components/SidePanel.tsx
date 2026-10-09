// Left: the New concept box, the result mode, the moves, length and stacking.
import { Plus, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { labelOf, useMoves } from '@/lib/api'
import { runMove, targetId } from '@/lib/press'
import type { ModeId } from '@/lib/types'
import { useGraph } from '@/store/graph'
import { DEFAULT_WORDS, useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { MoveGroups } from './MoveGroups'

function TargetLine() {
  const draft = useUI((u) => u.draft)
  useGraph((g) => g.version)
  const t = targetId()
  const n = t ? useGraph.getState().graph.nodes[t] : null
  const txt = n && n.kind !== 'transform' ? n.plain : ''
  return (
    <p className="min-h-5 text-[13px] text-muted-foreground">
      {draft.trim() ? 'A move adds this as a new concept on the map and transforms it.'
        : txt ? <>Moves apply to: <b className="font-semibold text-foreground">{txt.length > 110 ? txt.slice(0, 110) + '…' : txt}</b></>
          : 'Type a concept above, or select a box on the map.'}
    </p>
  )
}

function Explain() {
  const moves = useMoves((s) => s.moves)
  const mode = useSettings((s) => s.mode)
  if (!moves) return null
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-[13px] text-muted-foreground underline underline-offset-4">What each move does</CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 text-[13px]">
        <p className="text-muted-foreground">Every example starts from: {moves.modes[mode].anchor}</p>
        {moves.groups.map((g) => (
          <div key={g}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</h4>
            {moves.moves.filter((m) => m.group === g).map((m) => (
              <div key={m.id} className="mt-1.5">
                <div className="font-semibold">{labelOf(m, mode)}</div>
                <div className="text-muted-foreground">{m.blurb[mode]} <span className="text-foreground">e.g. {m.example[mode]}</span></div>
              </div>
            ))}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function SidePanel() {
  const moves = useMoves((s) => s.moves)
  const err = useMoves((s) => s.error)
  const s = useSettings()
  const draft = useUI((u) => u.draft)
  const busy = useUI((u) => u.busy)
  const words = s.words[s.mode] || DEFAULT_WORDS[s.mode]
  const plant = () => { const t = draft.trim(); if (!t) return; useGraph.getState().plant(t); useUI.getState().set({ draft: '' }) }
  const addSource = () => {
    const t = draft.trim(); if (!t) return
    useGraph.getState().addSource(t.slice(0, 1500), t.slice(0, 40))
    useUI.getState().set({ draft: '' })
  }
  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto [&>*]:shrink-0 border-r border-border p-4 max-md:border-r-0 max-md:border-b">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor="concept" className="text-sm font-medium">New concept</label>
        {moves && (
          <Tabs value={s.mode} onValueChange={(v) => s.set({ mode: v as ModeId })}>
            <TabsList className="h-8">
              {(Object.keys(moves.modes) as ModeId[]).map((m) => <TabsTrigger key={m} value={m} className="px-2.5 text-xs">{moves.modes[m].label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
      </div>
      <Textarea id="concept" rows={2} maxLength={1500} value={draft} placeholder={moves?.modes[s.mode].placeholder || ''}
        className="min-h-16 text-base"
        onChange={(e) => useUI.getState().set({ draft: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); plant() } }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={plant} disabled={!draft.trim()}><Plus />Add to map</Button>
        <Button size="sm" variant="ghost" onClick={addSource} disabled={!draft.trim()} title="Add a pasted passage (a book line, a list, lyrics) as a source to collide with">
          <Quote />Add as source
        </Button>
        {draft.length > 440 && <span className="ml-auto text-xs text-muted-foreground">{draft.length} / 1500</span>}
      </div>
      <TargetLine />

      {err && <p className="text-sm text-destructive">{err}</p>}
      <MoveGroups />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Length</span>
          <span className="normal-case tracking-normal font-normal">
            up to {words} words{s.words[s.mode] ? '' : ' (default)'}
            {!!s.words[s.mode] && <button className="ml-2 underline" onClick={() => s.set({ words: { ...s.words, [s.mode]: 0 } })}>Default</button>}
          </span>
        </div>
        <Slider min={5} max={60} step={1} value={[words]} onValueChange={([v]) => s.set({ words: { ...s.words, [s.mode]: v } })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={s.stacking} onCheckedChange={(v) => s.set({ stacking: v, stack: [] })} /> Stack moves
        </label>
        {s.stacking && (
          <Button size="sm" disabled={busy || s.stack.length < 2} className="ml-auto" onClick={() => runMove('stack')}>
            {s.stack.length >= 2 ? `Transform with ${s.stack.length} moves` : 'Transform'}
          </Button>
        )}
        {s.stacking && (
          <p className="w-full text-[13px] text-muted-foreground">
            {s.stack.length ? s.stack.map((id) => labelOf(moves?.moves.find((m) => m.id === id), s.mode)).join(' + ') : 'Pick two or three moves that can stack.'}
          </p>
        )}
      </div>
      <Explain />
    </aside>
  )
}
