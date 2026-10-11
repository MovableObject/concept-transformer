// The map: the node graph drawn by React Flow, top to bottom as in Houdini. Wires go from a node's output (the dot
// underneath) into a transform's input (the dot on top). The mouse wheel zooms; drag empty space to move around.
// Tab or right-click opens the add menu at the pointer; double-click on empty space adds a concept to type into;
// dropping a wire on empty space opens the menu wired to it; dropping it onto another box offers the collisions.
// Houdini gestures: drop an unwired transform onto a wire to insert it; hold Y and drag across wires to cut them;
// Alt-drag a node to leave a copy behind (the copy keeps the original's inputs).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, ReactFlow, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type FinalConnectionState, type Node, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { moveById, useMoves } from '@/lib/api'
import { addText, openTabMenu, wireInto } from '@/lib/actions'
import { canWire, downstream, stateOf } from '@/lib/graph'
import { polylinesCross, wirePoints, wireUnderBox } from '@/lib/wires'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { nodeTypes } from './nodes/Nodes'
import { groupColor } from './MoveIcon'
import { SHORTCUTS } from '@/lib/keys'
import { pointer } from '@/lib/pointer'
import { mapHooks } from '@/lib/mapHooks'
import { Button } from '@/components/ui/button'

export function MapView() {
  const graph = useGraph((s) => s.graph)
  const version = useGraph((s) => s.version)
  useMoves((s) => s.moves)
  const minimap = useSettings((s) => s.minimap)
  const rf = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const lastSelected = useRef<string | null>(null)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  const drag = useRef<{ wires: { id: string; from: string; to: string; port: number; pts: { x: number; y: number }[] }[]; copies: Record<string, string> | null; start: Record<string, { x: number; y: number }> }>({ wires: [], copies: null, start: {} })
  const [knife, setKnife] = useState(false)
  const [cutLine, setCutLine] = useState<{ x: number; y: number }[] | null>(null)

  const built = useMemo(() => {
    const ns: Node[] = graph.order.map((k) => {
      const n = graph.nodes[k]
      return { id: k, type: n.kind, position: { x: n.x, y: n.y }, data: {} }
    })
    const es: Edge[] = []
    const memo = new Map()
    for (const k of graph.order) {
      const n = graph.nodes[k]
      if (n.kind !== 'transform') continue
      const working = n.status === 'working'
      const color = groupColor(moveById(n.moveIds[0])?.group)
      n.inputs.forEach((src, i) => {
        if (!src || !graph.nodes[src]) return
        const upState = stateOf(graph, src, memo)
        es.push({ id: `${src}>${k}:${i}`, source: src, sourceHandle: 'out', target: k, targetHandle: `in${i}`, type: 'default',
          animated: working, style: { stroke: upState === 'stale' || upState === 'new' ? 'var(--muted-foreground)' : color, strokeWidth: 1.5,
            strokeDasharray: graph.nodes[src].kind === 'source' ? '5 4' : undefined } })
      })
    }
    return { ns, es }
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const edges = useMemo(() => (hoverWire ? built.es.map((e) => (e.id === hoverWire
    ? { ...e, style: { ...e.style, stroke: 'var(--primary)', strokeWidth: 3.5, strokeDasharray: undefined } } : e)) : built.es), [built, hoverWire])

  // ── Alt-drag copies; dropping a lone transform onto a wire inserts it ──
  const lone = (id: string) => {
    const g = useGraph.getState().graph
    const n = g.nodes[id]
    return n?.kind === 'transform' && n.inputs.every((i) => !i) && downstream(g, id).length === 0
  }
  const onNodeDragStart = useCallback((e: MouseEvent | TouchEvent, _n: Node, dragged: Node[]) => {
    const store = useGraph.getState()
    store.checkpoint()
    const ids = dragged.map((d) => d.id)
    drag.current = { wires: [], copies: null, start: Object.fromEntries(dragged.map((d) => [d.id, { ...d.position }])) }
    if ((e as MouseEvent).altKey) { drag.current.copies = store.duplicate(ids); return }
    if (ids.length === 1 && lone(ids[0])) {
      drag.current.wires = built.es.map((w) => ({ id: w.id, from: w.source, to: w.target, port: Number((w.targetHandle || 'in0').slice(2)) || 0, pts: wirePoints(w.id) }))
    }
  }, [built]) // eslint-disable-line react-hooks/exhaustive-deps
  const onNodeDrag = useCallback((_e: MouseEvent | TouchEvent, n: Node) => {
    if (!drag.current.wires.length) return
    const r = { x: n.position.x, y: n.position.y, w: n.measured?.width ?? 290, h: n.measured?.height ?? 80 }
    const hit = drag.current.wires.find((w) => wireUnderBox(w.pts, r))
    setHoverWire((h) => (h === (hit?.id ?? null) ? h : hit?.id ?? null))
  }, [])
  const onNodeDragStop = useCallback((_e: MouseEvent | TouchEvent, n: Node) => {
    const store = useGraph.getState()
    const { copies, start, wires } = drag.current
    drag.current = { wires: [], copies: null, start: {} }
    if (copies) {
      // React Flow dragged the original; swap so the original stays put (keeping what it feeds) and the copy moves.
      store.update((g) => {
        for (const [orig, copy] of Object.entries(copies)) {
          if (!g.nodes[orig] || !g.nodes[copy] || !start[orig]) continue
          g.nodes[copy].x = g.nodes[orig].x; g.nodes[copy].y = g.nodes[orig].y
          g.nodes[orig].x = Math.round(start[orig].x); g.nodes[orig].y = Math.round(start[orig].y)
        }
        const ids = Object.values(copies)
        g.selected = ids.length === 1 ? ids[0] : g.selected
      })
      return
    }
    const r = { x: n.position.x, y: n.position.y, w: n.measured?.width ?? 290, h: n.measured?.height ?? 80 }
    const hit = wires.find((w) => wireUnderBox(w.pts, r))   // from where it landed, not the last hover (a fast drop skips it)
    setHoverWire(null)
    if (hit) { const why = store.insert(n.id, hit.from, hit.to, hit.port); if (why) useUI.getState().toast(why) }
  }, [])

  // ── Y knife: hold Y, drag across wires, let go to cut them ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'y' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (useUI.getState().editing || document.querySelector('[role=dialog], [role=alertdialog]')) return
      setKnife(true)
    }
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'y') setKnife(false) }
    const blur = () => setKnife(false)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])
  const local = (e: React.PointerEvent) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const finishCut = (line: { x: number; y: number }[]) => {
    const r = wrap.current!.getBoundingClientRect()
    const flow = line.map((p) => rf.screenToFlowPosition({ x: p.x + r.left, y: p.y + r.top }))
    if (flow.length < 2) return
    const hits = built.es.filter((w) => polylinesCross(flow, wirePoints(w.id)))
    if (!hits.length) return
    useGraph.getState().cut(hits.map((w) => ({ to: w.target, port: Number((w.targetHandle || 'in0').slice(2)) || 0 })))
  }

  // Merge the store's nodes into React Flow's list, keeping measured sizes; follow the store's selection when it
  // changes (a new node selects itself), otherwise keep React Flow's own (box-select, shift-click).
  useEffect(() => {
    const sel = graph.selected
    const selChanged = sel !== lastSelected.current
    lastSelected.current = sel
    setNodes((prev) => {
      const pm = new Map(prev.map((n) => [n.id, n]))
      return built.ns.map((n) => {
        const p = pm.get(n.id)
        return { ...n, measured: p?.measured, selected: selChanged ? n.id === sel : (p?.selected ?? n.id === sel) }
      })
    })
  }, [built]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bring a newly selected node into view if it is off screen.
  useEffect(() => {
    const id = graph.selected
    if (!id || !wrap.current) return
    const t = setTimeout(() => {
      const n = rf.getNode(id)
      if (!n) return
      const r = wrap.current!.getBoundingClientRect()
      const tl = rf.screenToFlowPosition({ x: r.left + 30, y: r.top + 30 })
      const br = rf.screenToFlowPosition({ x: r.right - 60, y: r.bottom - 30 })
      const w = n.measured?.width ?? 240, h = n.measured?.height ?? 60
      const inside = n.position.x >= tl.x && n.position.y >= tl.y && n.position.x + w <= br.x && n.position.y + h <= br.y
      if (!inside) rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: rf.getZoom(), duration: 300 })
    }, 60)
    return () => clearTimeout(t)
  }, [graph.selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes.filter((c) => c.type === 'dimensions' || c.type === 'select'), nds))
    const moves = changes.filter((c) => c.type === 'position' && c.position)
    const store = useGraph.getState()
    if (moves.length) {
      store.update((g) => {
        for (const c of moves) {
          if (c.type !== 'position' || !c.position || !g.nodes[c.id]) continue
          g.nodes[c.id].x = Math.round(c.position.x); g.nodes[c.id].y = Math.round(c.position.y)
        }
      }, { persist: !moves.some((c) => c.type === 'position' && c.dragging) })
    }
    const sel = changes.flatMap((c) => (c.type === 'select' && c.selected ? [c.id] : []))
    if (sel.length === 1 && sel[0] !== store.graph.selected) {
      lastSelected.current = sel[0]
      store.update((g) => { g.selected = sel[0] }, { persist: false })
    }
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return
    const port = Number((c.targetHandle || 'in0').slice(2)) || 0
    wireInto(c.source, c.target, port)
  }, [])
  const isValidConnection = useCallback((c: Connection | Edge) => {
    const g = useGraph.getState().graph
    const t = g.nodes[c.target]
    return !canWire(g, c.source, c.target, t?.kind === 'transform' ? moveById(t.moveIds[0]) : undefined)
  }, [])
  // A wire dropped where no input took it: onto another box offers the collisions; onto empty space, the add menu.
  const onConnectEnd = useCallback((e: MouseEvent | TouchEvent, s: FinalConnectionState) => {
    if (s.isValid || !s.fromNode) return
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const from = s.fromNode.id
    const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node') as HTMLElement | null
    const over = el?.dataset.id
    const g = useGraph.getState().graph
    if (over && over !== from && g.nodes[over] && g.nodes[over].kind !== 'note') {
      openTabMenu({ sx: pt.clientX, sy: pt.clientY, inputs: [from, over], collideOnly: true })
      return
    }
    if (!over) openTabMenu({ sx: pt.clientX, sy: pt.clientY, at: rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }), inputs: [from] })
  }, [rf])

  const onBeforeDelete = useCallback(async ({ nodes: del, edges }: { nodes: Node[]; edges: Edge[] }) => {
    if (useUI.getState().editing) return false
    const store = useGraph.getState()
    if (del.length) store.remove(del.map((n) => n.id))
    for (const e of edges) if (!del.some((n) => n.id === e.source || n.id === e.target)) store.unwire(e.target, Number((e.targetHandle || 'in0').slice(2)) || 0)
    return false   // the store did it
  }, [])

  useEffect(() => {
    mapHooks.selectedIds = () => rf.getNodes().filter((n) => n.selected).map((n) => n.id)
    mapHooks.toFlow = (p) => rf.screenToFlowPosition(p)
    mapHooks.fit = () => { void rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 }) }
    mapHooks.tidy = () => {
      const measured: Record<string, { w: number; h: number }> = {}
      for (const n of rf.getNodes()) if (n.measured?.width) measured[n.id] = { w: n.measured.width, h: n.measured.height ?? 60 }
      useGraph.getState().tidy(measured)
      setTimeout(() => mapHooks.fit(), 80)
    }
  }, [rf])

  const empty = graph.order.length === 0
  return (
    <div ref={wrap} className="relative h-full min-h-[420px] w-full"
      onPointerMove={(e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true }}
      onPointerLeave={() => { pointer.inside = false }}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return
        addText('concept', rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
      }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onConnect={onConnect} isValidConnection={isValidConnection} onConnectEnd={onConnectEnd}
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
        onBeforeDelete={onBeforeDelete} deleteKeyCode={['Delete', 'Backspace']}
        connectionMode={ConnectionMode.Strict} connectionRadius={30}
        onPaneClick={() => useUI.getState().set({ tabMenu: null })}
        onPaneContextMenu={(e) => { e.preventDefault(); openTabMenu({ sx: e.clientX, sy: e.clientY, at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), inputs: [] }) }}
        zoomOnDoubleClick={false}
        fitView fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }} minZoom={0.15} maxZoom={2.5}
        selectionOnDrag={false} panOnDrag multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        proOptions={{ hideAttribution: true }} colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="color-mix(in oklch, var(--foreground) 16%, transparent)" />
        {minimap && <MiniMap pannable zoomable position="bottom-right"
          nodeColor={(n) => {
            const m = useGraph.getState().graph.nodes[n.id]
            return m?.kind === 'transform' ? (groupColor(moveById(m.moveIds[0])?.group) || 'var(--chart-3)') : m?.kind === 'source' ? 'var(--chart-2)' : 'var(--muted-foreground)'
          }}
          maskColor="color-mix(in oklch, var(--background) 70%, transparent)" className="max-md:!hidden" />}
      </ReactFlow>
      {(knife || cutLine) && (
        <div className="absolute inset-0 z-10 cursor-crosshair" title="Drag across wires to cut them"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setCutLine([local(e)]) }}
          onPointerMove={(e) => { if (cutLine) setCutLine([...cutLine, local(e)]) }}
          onPointerUp={() => { if (cutLine) finishCut(cutLine); setCutLine(null) }}
          onPointerCancel={() => setCutLine(null)}>
          {cutLine && cutLine.length > 1 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polyline points={cutLine.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--destructive)" strokeWidth={1.5} strokeDasharray="6 4" />
            </svg>
          )}
        </div>
      )}
      {empty && <EmptyMap onStart={() => addText('concept', rf.screenToFlowPosition({ x: (wrap.current?.getBoundingClientRect().left ?? 0) + 80, y: (wrap.current?.getBoundingClientRect().top ?? 0) + 120 }))} />}
    </div>
  )
}

/** A short tutorial on the empty map. */
function EmptyMap({ onStart }: { onStart: () => void }) {
  const steps = [
    ['Add a concept.', 'Double-click the map, or press Tab, and type an idea into the box.'],
    ['Add a transform.', 'Select the box and press Tab (or right-click), or drag from the dot under it onto empty space, and pick a move. The panel on the left lists them too.'],
    ['Run it.', 'Nothing runs until you press Run on a transform, or Run all at the top. Its best result shows in it; “1 of 3” steps through the others.'],
    ['Keep going.', 'Drag from the dot under a transform into the next one. Drop a wire onto another box to collide the two. Drop a new transform onto a wire to put it in between; hold Y and drag across wires to cut them; Alt-drag a box to copy it. The wheel zooms; drag empty space to move around.'],
  ]
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 max-md:p-3">
      <div className="pointer-events-auto max-w-md space-y-3 rounded-md border border-border bg-card/90 p-5 text-sm shadow-sm max-md:p-4">
        <ol className="space-y-2">
          {steps.map(([head, body], i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-primary/20 text-xs font-semibold text-primary">{i + 1}</span>
              <span className="text-muted-foreground"><b className="text-foreground">{head}</b> {body}</span>
            </li>
          ))}
        </ol>
        <Button size="sm" variant="outline" onClick={onStart}>Add a concept</Button>
        <p className="text-[11px] text-muted-foreground max-md:hidden">Keys: {SHORTCUTS.map(([k, what]) => `${k} ${what}`).join(' · ')}</p>
      </div>
    </div>
  )
}
