// The kinds of node on the map: concepts and sources you type into, notes, and transforms that hold their results.
// Graphs run top to bottom: wires go from the dot under a node (its output) into a dot on top of a transform (its inputs).
import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, EyeOff, Loader2, Play, Quote, RotateCw, StickyNote, ThumbsDown, ThumbsUp, Trash2, Volume2, VolumeX } from 'lucide-react'
import { labelOf, moveById } from '@/lib/api'
import { runNodes } from '@/lib/cook'
import { C_W, N_W, S_W, T_W, portsOf, stateOf, type NodeState } from '@/lib/graph'
import { cn } from '@/lib/utils'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { MoveIcon, groupColor } from '../MoveIcon'
import { MoveTip } from '../MoveGroups'
import { MODE_TIPS } from '../SidePanel'
import { speak, useSpeaking } from '@/lib/speak'
import { Slider } from '@/components/ui/slider'
import { DEFAULT_WORDS } from '@/store/settings'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const outCls = '!size-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary'

/** Small buttons on a node: read it aloud and delete it (and, on a transform, bypass it). */
function NodeTools({ id, text, children }: { id: string; text: string; children?: React.ReactNode }) {
  const saying = useSpeaking((s) => s.key === id)
  const btn = 'nodrag flex size-6 items-center justify-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40'
  return (
    <div className="flex items-center gap-0.5">
      {children}
      <button className={btn} disabled={!text} title={saying ? 'Stop reading' : 'Read aloud'} aria-label={saying ? 'Stop reading' : 'Read aloud'}
        onClick={(e) => { e.stopPropagation(); speak(text, id) }}>
        {saying ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </button>
      <button className={cn(btn, 'hover:text-destructive')} title="Delete (Delete key; Ctrl+Z brings it back)" aria-label="Delete"
        onClick={(e) => { e.stopPropagation(); if (useSpeaking.getState().key === id) { window.speechSynthesis?.cancel(); useSpeaking.setState({ key: null }) } useGraph.getState().remove([id]) }}>
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
const inCls = '!size-3 !border-2 !border-background !bg-muted-foreground'

/** Text typed straight into a node. Enter keeps it (Shift+Enter for a new line); Escape or clicking away too. */
function NodeText({ id, text, placeholder, className, clamp }: { id: string; text: string; placeholder: string; className?: string; clamp: string }) {
  const editing = useUI((u) => u.editing === id)
  const [draft, setDraft] = useState(text)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editing) { setDraft(text); useGraph.getState().checkpoint(); setTimeout(() => { ref.current?.focus(); ref.current?.select() }, 0) } }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => {
    const clean = draft.replace(/[ \t]+/g, ' ').trim()
    const g = useGraph.getState()
    useUI.getState().set({ editing: null })
    if (!clean) { if (!text.trim()) g.remove([id]); return }   // an empty new box goes away
    if (clean !== text) g.setText(id, clean)
  }
  if (editing) {
    return (
      <textarea ref={ref} value={draft} rows={3} placeholder={placeholder} aria-label={placeholder}
        className={cn('nodrag nowheel nopan block w-full resize-none rounded-[3px] border border-input bg-background px-1.5 py-1 text-[13px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/50', className)}
        onChange={(e) => setDraft(e.target.value)} onBlur={done}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done() }
          if (e.key === 'Escape') { e.preventDefault(); done() }
        }} />
    )
  }
  return text.trim()
    ? <div className={cn(clamp, className)}>{text}</div>
    : <div className={cn('italic text-muted-foreground', className)}>{placeholder}</div>
}

export const ConceptNode = memo(function ConceptNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  if (!n || n.kind !== 'concept') return null
  return (
    <div className={cn('group relative rounded-[4px] border border-muted-foreground/60 bg-secondary px-3 py-2 text-[13px] leading-snug shadow-sm',
      selected && '!border-primary ring-1 ring-primary')} style={{ width: C_W }}
      onDoubleClick={(e) => { e.stopPropagation(); useUI.getState().set({ editing: id }) }}>
      <NodeText id={id} text={n.text} placeholder="Type a concept" clamp="line-clamp-5" />
      <div className="mt-1 flex justify-end"><NodeTools id={id} text={n.text} /></div>
      <Handle type="source" id="out" position={Position.Bottom} className={outCls} title="Drag into a transform, or onto empty space to add one" />
    </div>
  )
})

export const SourceNode = memo(function SourceNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  if (!n || n.kind !== 'source') return null
  return (
    <div className={cn('group relative rounded-[4px] border border-dashed border-chart-2 bg-background px-3 py-2 text-[12.5px] leading-snug shadow-sm',
      selected && '!border-solid !border-primary ring-1 ring-primary')} style={{ width: S_W }}
      onDoubleClick={(e) => { e.stopPropagation(); useUI.getState().set({ editing: id }) }}>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-chart-2"><Quote className="size-3" />Source
        <span className="ml-auto normal-case tracking-normal"><NodeTools id={id} text={n.text} /></span></div>
      <NodeText id={id} text={n.text} placeholder="Paste a passage to collide with" className="italic" clamp="line-clamp-6 text-muted-foreground" />
      <Handle type="source" id="out" position={Position.Bottom} className={outCls} title="Drag into a collision" />
    </div>
  )
})

export const NoteNode = memo(function NoteNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  if (!n || n.kind !== 'note') return null
  return (
    <div className={cn('rounded-[3px] border border-chart-4/50 bg-chart-4/10 px-3 py-2 text-[12.5px] leading-snug text-foreground/90 shadow-sm',
      selected && '!border-primary ring-1 ring-primary')} style={{ width: N_W }}
      onDoubleClick={(e) => { e.stopPropagation(); useUI.getState().set({ editing: id }) }}>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-chart-4"><StickyNote className="size-3" />Note
        <span className="ml-auto normal-case tracking-normal"><NodeTools id={id} text={n.text} /></span></div>
      <NodeText id={id} text={n.text} placeholder="Write a note" clamp="line-clamp-8 whitespace-pre-wrap" />
    </div>
  )
})

const STATE_WORDS: Record<NodeState, string> = {
  new: 'Not run yet', working: 'Running…', done: '', stale: 'Changed since it ran', error: 'Failed', bypass: 'Bypassed',
}

export const TransformNode = memo(function TransformNode({ id, selected }: NodeProps) {
  const n = useGraph((s) => s.graph.nodes[id])
  const state = useGraph((s) => stateOf(s.graph, id))
  const busy = useUI((u) => u.busy)
  if (!n || n.kind !== 'transform') return null
  const def = moveById(n.moveIds[0])
  const ports = portsOf(n, def)
  const name = n.moveIds.length > 1
    ? n.moveIds.map((m) => labelOf(moveById(m), n.mode)).join(' + ')
    : labelOf(def, n.mode) || 'Unknown move'
  const extra = n.card ? `“${n.card}”` : n.field ? `→ ${n.field}` : ''
  const r = n.results[Math.min(n.shown, n.results.length - 1)]
  const color = groupColor(def?.group) || 'var(--muted-foreground)'
  const canRun = state !== 'working' && !n.bypass
  return (
    <div className={cn('group relative rounded-[4px] border bg-card text-[12.5px] leading-snug shadow-sm',
      state === 'new' && 'border-dashed border-muted-foreground/60',
      state === 'stale' && 'border-amber-400/80', state === 'error' && 'border-destructive',
      (state === 'done' || state === 'working') && 'border-border', n.bypass && 'opacity-55',
      selected && '!border-primary ring-1 ring-primary')}
      style={{ width: T_W, borderLeft: `4px solid ${color}` }}>
      {Array.from({ length: ports }, (_, i) => (
        <Handle key={i} type="target" id={`in${i}`} position={Position.Top} className={inCls}
          style={{ left: ports === 2 ? (i ? '68%' : '32%') : '50%' }}
          title={ports === 2 ? (i ? 'Input B' : 'Input A') : 'Input'} />
      ))}
      {ports === 2 && (
        <>
          <span className="pointer-events-none absolute -top-4 left-[32%] ml-2 text-[9px] font-bold text-muted-foreground">A</span>
          <span className="pointer-events-none absolute -top-4 left-[68%] ml-2 text-[9px] font-bold text-muted-foreground">B</span>
        </>
      )}
      <div className="flex items-start gap-1.5 border-b border-border/70 px-2 py-1.5">
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <div className="flex min-w-0 flex-1 cursor-help items-start gap-1.5">
              {n.moveIds.map((m) => <MoveIcon key={m} id={m} className="size-5" />)}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold" style={{ color }}>{name}</div>
                {extra && <div className="truncate text-[11px] text-muted-foreground">{extra}</div>}
              </div>
            </div>
          </TooltipTrigger>
          {def && (
            <TooltipContent side="top" className="max-w-80">
              <p className="mb-1 font-semibold">{name}</p>
              <MoveTip m={def} mode={n.mode} />
            </TooltipContent>
          )}
        </Tooltip>
        {state === 'working'
          ? <Loader2 className="mt-0.5 size-4 animate-spin text-muted-foreground" aria-label="Running" />
          : canRun && state !== 'done' && (
            <button className="nodrag flex items-center gap-1 rounded-[3px] bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
              disabled={busy} title="Run this transform (R)" onClick={(e) => { e.stopPropagation(); runNodes([id]) }}>
              <Play className="size-3" />Run
            </button>
          )}
      </div>
      <div className="nodrag flex items-center gap-1 border-b border-border/70 px-2 py-1" role="radiogroup" aria-label="What this transform gives">
        {(['image', 'ideas'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={n.mode === m} title={MODE_TIPS[m]}
            className={cn('rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
              n.mode === m ? 'bg-secondary text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground')}
            onClick={(e) => { e.stopPropagation(); if (n.mode !== m) useGraph.getState().setParam(id, { mode: m }) }}>
            {m === 'image' ? 'Images' : 'Ideas'}
          </button>
        ))}
        <span className="ml-auto">
          <NodeTools id={id} text={n.bypass ? '' : (r ? (r.tag ? `${r.plain} ${r.tag}` : r.plain) : '')}>
            {r && !n.bypass && (['kept', 'discarded'] as const).map((v) => (
              <button key={v} className={cn('nodrag flex size-6 items-center justify-center rounded-[3px] hover:bg-accent',
                r.verdict === v ? (v === 'kept' ? 'text-primary' : 'text-destructive') : 'text-muted-foreground hover:text-foreground')}
                title={v === 'kept' ? 'Keep: later runs aim for ideas like this (K)' : 'Discard: later runs steer away from ideas like this (X)'}
                aria-label={v === 'kept' ? 'Keep' : 'Discard'} aria-pressed={r.verdict === v}
                onClick={(e) => { e.stopPropagation(); useGraph.getState().setVerdict(id, r.verdict === v ? undefined : v) }}>
                {v === 'kept' ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
              </button>
            ))}
            <button className={cn('nodrag flex h-6 items-center gap-1 rounded-[3px] px-1.5 text-[10.5px] font-medium',
              n.bypass ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              role="switch" aria-checked={!!n.bypass} title="Bypass: pass the input straight through without this move (B)"
              onClick={(e) => { e.stopPropagation(); useGraph.getState().setParam(id, { bypass: !n.bypass || undefined }) }}>
              <EyeOff className="size-3.5" />Bypass
            </button>
          </NodeTools>
        </span>
      </div>
      <div className="nodrag nowheel flex items-center gap-2 border-b border-border/70 px-2.5 py-1.5" title="Longest a result may be, in words">
        <span className="text-[10.5px] text-muted-foreground">Length</span>
        <Slider min={5} max={60} step={1} value={[n.words || DEFAULT_WORDS[n.mode]]} aria-label="Length of results" className="flex-1"
          onPointerDown={(e) => { e.stopPropagation(); useGraph.getState().checkpoint() }}
          onValueChange={([v]) => useGraph.getState().setParam(id, { words: v }, false)} />
        <span className="w-14 text-right text-[10.5px] tabular-nums text-muted-foreground">{n.words || DEFAULT_WORDS[n.mode]} words</span>
      </div>
      <div className="px-2.5 py-2">
        {n.bypass ? <div className="italic text-muted-foreground">Bypassed: passes its input straight through.</div>
          : r ? <div className={cn('line-clamp-5', state === 'stale' && 'text-muted-foreground')}>{r.plain}</div>
            : <div className="italic text-muted-foreground">{state === 'error' ? n.error : 'Press Run to see the result.'}</div>}
        {(STATE_WORDS[state] && state !== 'new' && !n.bypass) && (
          <div className={cn('mt-1 flex items-center gap-1 text-[10.5px]', state === 'error' ? 'text-destructive' : state === 'stale' ? 'text-amber-400' : 'text-muted-foreground')}>
            {state === 'stale' || state === 'error' ? <AlertTriangle className="size-3" /> : null}{STATE_WORDS[state]}
          </div>
        )}
        {(r?.tag || n.results.length > 1) && !n.bypass && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {r?.tag && <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">{r.tag.replace(/^\[|\]$/g, '')}</span>}
            {n.results.length > 1 && (
              <button className="nodrag ml-auto flex items-center gap-1 rounded-[3px] border border-input bg-background px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-foreground"
                title="Show the next result; it becomes what this transform passes on (N)"
                onClick={(e) => { e.stopPropagation(); useGraph.getState().rotate(id) }}>
                {n.shown + 1} of {n.results.length} <RotateCw className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <Handle type="source" id="out" position={Position.Bottom} className={outCls} title="Drag into the next transform, or onto empty space to add one" />
    </div>
  )
})

export const nodeTypes = { concept: ConceptNode, source: SourceNode, note: NoteNode, transform: TransformNode }
