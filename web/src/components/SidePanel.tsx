// Left: add boxes, the settings new transforms start with, and the moves palette.
import { FileText, Quote, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { labelOf, moveById, useMoves } from '@/lib/api'
import { addText } from '@/lib/actions'
import { outputOf } from '@/lib/graph'
import type { ModeId } from '@/lib/types'
import { useGraph } from '@/store/graph'
import { DEFAULT_WORDS, useSettings } from '@/store/settings'
import { MoveGroups } from './MoveGroups'

export const MODE_TIPS: Record<string, string> = {
  image: 'Every result is one still picture: what is in the frame, plain enough to draw, photograph or give to an image generator.',
  ideas: 'Every result is a one-line pitch for something you could make or do: a product, a service, a rule, a game, an event or a story premise.',
}

function TargetLine() {
  useGraph((g) => g.version)
  const g = useGraph.getState().graph
  const n = g.selected ? g.nodes[g.selected] : null
  let txt = ''
  if (n && n.kind !== 'note') {
    txt = n.kind === 'transform' ? `${labelOf(moveById(n.moveIds[0]), n.mode)}${outputOf(g, n.id) ? ': ' + outputOf(g, n.id) : ''}` : n.text
  }
  return (
    <p className="min-h-5 text-[13px] text-muted-foreground">
      {txt ? <>New transforms wire to: <b className="font-semibold text-foreground">{txt.length > 100 ? txt.slice(0, 100) + '…' : txt}</b></>
        : 'Select a box first and new transforms wire to it. Nothing runs until you press Run.'}
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

export function ModeTabs({ value, onChange, size = 'sm' }: { value: ModeId; onChange: (m: ModeId) => void; size?: 'sm' | 'xs' }) {
  const moves = useMoves((s) => s.moves)
  if (!moves) return null
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ModeId)}>
      <TabsList className={size === 'xs' ? 'h-7' : 'h-8'}>
        {(Object.keys(moves.modes) as ModeId[]).map((m) => (
          <Tooltip key={m}>
            <TooltipTrigger asChild><TabsTrigger value={m} className="px-2.5 text-xs">{moves.modes[m].label}</TabsTrigger></TooltipTrigger>
            {MODE_TIPS[m] && <TooltipContent side="bottom" className="max-w-64">{MODE_TIPS[m]}</TooltipContent>}
          </Tooltip>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function SidePanel() {
  const err = useMoves((s) => s.error)
  const s = useSettings()
  const words = s.words[s.mode] || DEFAULT_WORDS[s.mode]
  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto [&>*]:shrink-0 border-r border-border p-4 max-md:border-r-0 max-md:border-b">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add to the map</div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => addText('concept')} title="A box you type an idea into (or double-click the map)"><FileText />Concept</Button>
          <Button size="sm" variant="outline" onClick={() => addText('source')} title="A pasted passage (a book line, a list, lyrics) to collide with"><Quote />Source</Button>
          <Button size="sm" variant="ghost" onClick={() => addText('note')} title="A sticky note for yourself; never sent anywhere"><StickyNote />Note</Button>
        </div>
      </div>

      <div className="space-y-2 rounded-[4px] border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New transforms give</span>
          <ModeTabs value={s.mode} onChange={(m) => s.set({ mode: m })} />
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Length</span>
          <span className="font-normal normal-case tracking-normal">
            up to {words} words{s.words[s.mode] ? '' : ' (default)'}
            {!!s.words[s.mode] && <button className="ml-2 underline" onClick={() => s.set({ words: { ...s.words, [s.mode]: 0 } })}>Default</button>}
          </span>
        </div>
        <Slider min={5} max={60} step={1} value={[words]} onValueChange={([v]) => s.set({ words: { ...s.words, [s.mode]: v } })} aria-label="Length of results" />
        <p className="text-[11px] text-muted-foreground">Each transform keeps its own settings; change them by selecting it.</p>
      </div>

      <TargetLine />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <MoveGroups />
      <Explain />
    </aside>
  )
}
