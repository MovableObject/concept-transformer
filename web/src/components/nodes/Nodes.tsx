// The three kinds of box on the map.
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Loader2, Plus, Quote, RotateCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { C_W, S_W, T_W } from '@/lib/layout'
import { resultsOf, shownResult, useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { MovePicker } from '../MovePicker'
import { MoveIcon } from '../MoveIcon'

const handleCls = '!opacity-0 group-hover:!opacity-100 [.selected_&]:!opacity-100'

function PlusPicker({ id }: { id: string }) {
  const open = useUI((u) => u.pickerFor === id)
  return (
    <Popover open={open} onOpenChange={(o) => useUI.getState().set({ pickerFor: o ? id : null })}>
      <PopoverTrigger asChild>
        <button
          className="nodrag absolute -right-9 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] bg-primary text-primary-foreground shadow hover:brightness-125"
          title="Transform this: open the moves" aria-label="Transform this"
        ><Plus className="size-4" /></button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-[340px] max-h-[70vh] overflow-y-auto p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}>
        <MovePicker onDone={() => useUI.getState().set({ pickerFor: null })} />
      </PopoverContent>
    </Popover>
  )
}

export const ConceptNode = memo(function ConceptNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  if (!n || n.kind !== 'concept') return null
  const root = !n.parent
  return (
    <div className={cn('group relative rounded-[4px] border px-3 py-2 text-[13px] leading-snug shadow-sm transition-colors',
      root ? 'border-muted-foreground bg-secondary' : 'border-input bg-card',
      n.verdict === 'kept' && 'border-chart-1', n.verdict === 'discarded' && 'opacity-55',
      selected && '!border-primary ring-1 ring-primary')}
      style={{ width: C_W }} title={n.plain}>
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="line-clamp-4">{n.plain}</div>
      {n.verdict && (
        <span className="absolute -top-2 right-2 rounded-[3px] border border-border bg-background px-1 text-muted-foreground">
          {n.verdict === 'kept' ? <ThumbsUp className="size-3" /> : <ThumbsDown className="size-3" />}
        </span>
      )}
      <Handle type="source" position={Position.Right} className={handleCls} title="Drag onto another box to collide them" />
      {selected && <PlusPicker id={id} />}
    </div>
  )
})

export const SourceNode = memo(function SourceNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  if (!n || n.kind !== 'source') return null
  return (
    <div className={cn('group relative rounded-[4px] border border-dashed border-chart-2 bg-background px-3 py-2 text-[12.5px] leading-snug shadow-sm',
      selected && '!border-primary !border-solid ring-1 ring-primary')} style={{ width: S_W }} title={n.plain}>
      <Handle type="target" position={Position.Left} className={handleCls} />
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-chart-2"><Quote className="size-3" />Source</div>
      <div className="line-clamp-6 italic text-muted-foreground">{n.plain}</div>
      <Handle type="source" position={Position.Right} className={handleCls} title="Drag onto another box to collide with this source" />
      {selected && <PlusPicker id={id} />}
    </div>
  )
})

export const TransformNode = memo(function TransformNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  const total = useGraph((s) => resultsOf(s.graph, id).length)
  const shownTag = useGraph((s) => { const r = shownResult(s.graph, id); const c = r ? s.graph.nodes[r] : null; return c && c.kind === 'concept' ? c.tag.replace(/^\[|\]$/g, '') : '' })
  if (!n || n.kind !== 'transform') return null
  return (
    <div className={cn('group relative rounded-[4px] border border-dashed bg-background px-2.5 py-2 shadow-sm',
      n.status === 'error' ? 'border-destructive' : n.status === 'working' ? 'border-muted-foreground' : 'border-chart-3',
      n.parent2 && 'border-chart-2', selected && '!border-solid !border-primary ring-1 ring-primary')} style={{ width: T_W }}>
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      <div className="flex items-start gap-1.5">
        {n.moveIds.length > 0 && <span className="mt-[-1px] flex shrink-0 gap-0.5">{n.moveIds.map((mid) => <MoveIcon key={mid} id={mid} className="size-5" />)}</span>}
        <div className="text-[12px] font-semibold leading-tight text-chart-1 line-clamp-3">{n.move}</div>
      </div>
      {shownTag && <div className="mt-1 text-[11px] leading-tight text-muted-foreground line-clamp-2">{shownTag}</div>}
      {n.status === 'working' && <div className="mt-1 flex items-center gap-1 text-[11px] italic text-muted-foreground"><Loader2 className="size-3 animate-spin" />working…</div>}
      {n.status === 'error' && <div className="mt-1 text-[11px] italic text-destructive">failed, select for details</div>}
      {total > 1 && (
        <button className="nodrag mt-1.5 flex items-center gap-1 rounded-[3px] border border-input bg-card px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-foreground"
          title="Show the next option from this press" onClick={(e) => { e.stopPropagation(); useGraph.getState().rotate(id) }}>
          {(n.shown || 0) + 1} of {total} <RotateCw className="size-3" />
        </button>
      )}
      <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
    </div>
  )
})

export const nodeTypes = { concept: ConceptNode, source: SourceNode, transform: TransformNode }
