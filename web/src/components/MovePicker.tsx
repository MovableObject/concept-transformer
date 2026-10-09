// The moves, in a popover on a box ("+"), and the collision picker after two boxes are connected.
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { labelOf, useMoves } from '@/lib/api'
import { runMove } from '@/lib/press'
import { nodeOf, useGraph } from '@/store/graph'
import { DEFAULT_WORDS, useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { FieldInput, MoveGroups, MoveTip } from './MoveGroups'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function MovePicker({ onDone }: { onDone?: () => void }) {
  const moves = useMoves((s) => s.moves)
  const s = useSettings()
  const busy = useUI((u) => u.busy)
  if (!moves) return null
  const words = s.words[s.mode] || DEFAULT_WORDS[s.mode]
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Transform this</span>
        <span className="text-xs text-muted-foreground">{moves.modes[s.mode].label} · up to {words} words</span>
      </div>
      <MoveGroups compact onDone={onDone} only={(m) => m.inputs !== 2} />
      {moves.moves.some((m) => m.field && !m.deck && m.inputs !== 2) && (
        <div className="space-y-1.5">
          {moves.moves.filter((m) => m.field && !m.deck && m.inputs !== 2).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs"><span className="w-28 shrink-0 text-muted-foreground">{labelOf(m, s.mode)}</span><FieldInput m={m} /></div>
          ))}
        </div>
      )}
      {s.stacking && (
        <Button className="w-full" size="sm" disabled={busy || s.stack.length < 2} onClick={() => { onDone?.(); void runMove('stack') }}>
          {s.stack.length >= 2 ? `Transform with ${s.stack.length} moves` : 'Pick two or three moves'}
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">To collide two boxes, drag from the dot on the right of one box onto another.</p>
    </div>
  )
}

export function CollisionDialog() {
  const pair = useUI((u) => u.collision)
  const moves = useMoves((s) => s.moves)
  const mode = useSettings((s) => s.mode)
  const busy = useUI((u) => u.busy)
  useGraph((g) => g.version)
  if (!pair || !moves) return null
  const a = nodeOf(pair.a), b = nodeOf(pair.b)
  const two = moves.moves.filter((m) => m.inputs === 2)
  const txt = (n: ReturnType<typeof nodeOf>) => (n && n.kind !== 'transform' ? n.plain : '')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) useUI.getState().set({ collision: null }) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collide two boxes</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm">
              <p><span className="text-muted-foreground">A:</span> {txt(a).slice(0, 160)}</p>
              <p><span className="text-muted-foreground">B:</span> {txt(b).slice(0, 160)}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        {two.length ? (
          <div className="flex flex-wrap gap-2">
            {two.map((m) => (
              <Tooltip key={m.id} delayDuration={400}>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runMove(m.id, { parents: [pair.a, pair.b] })}>{labelOf(m, mode)}</Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><MoveTip m={m} /></TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Collision moves are coming in the next update.</p>}
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => useUI.getState().set({ collision: { a: pair.b, b: pair.a } })}>Swap A and B</Button>
          <Button variant="outline" size="sm" onClick={() => useUI.getState().set({ collision: null })}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
