// The map: React Flow drawing the graph store. Boxes keep the places the store gives them; dragging a box moves
// its whole branch; dragging from one box's right-hand dot onto another box opens the collision picker.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, ReactFlow, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { visibleIds } from '@/lib/layout'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'
import { nodeTypes } from './nodes/Nodes'
import { Button } from '@/components/ui/button'
import { useMoves } from '@/lib/api'
import { SHORTCUTS } from '@/lib/keys'
import { useSettings } from '@/store/settings'

export function MapView() {
  const graph = useGraph((s) => s.graph)
  const version = useGraph((s) => s.version)
  const rf = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const lastSelected = useRef<string | null>(null)

  const built = useMemo(() => {
    const vis = visibleIds(graph)
    const ns: Node[] = graph.order.filter((k) => vis.has(k)).map((k) => {
      const n = graph.nodes[k]
      return { id: k, type: n.kind, position: { x: n.x ?? 0, y: n.y ?? 0 }, data: {} }
    })
    const es: Edge[] = []
    for (const k of graph.order) {
      if (!vis.has(k)) continue
      const n = graph.nodes[k]
      if (n.parent && vis.has(n.parent)) es.push({ id: `${n.parent}>${k}`, source: n.parent, target: k, type: 'default' })
      if (n.kind === 'transform' && n.parent2 && vis.has(n.parent2)) {
        es.push({ id: `${n.parent2}>${k}`, source: n.parent2, target: k, type: 'default', style: { strokeDasharray: '5 4' } })
      }
    }
    return { ns, es }
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merge the store's boxes into React Flow's list, keeping measured sizes; follow the store's selection when it
  // changes (a new press selects its result), otherwise keep React Flow's own (box-select, shift-click).
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

  // Bring a newly selected box into view if it is off screen.
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
      const g = store.graph
      // one box dragged: its branch follows; several selected boxes dragged: each moves alone
      const branch = moves.length === 1
      store.update((gg) => {
        for (const c of moves) {
          if (c.type !== 'position' || !c.position) continue
          const n = gg.nodes[c.id]
          if (!n) continue
          const dx = c.position.x - (n.x ?? 0), dy = c.position.y - (n.y ?? 0)
          const ids = branch ? [c.id, ...descendantsIn(g, c.id)] : [c.id]
          for (const k of ids) { if (gg.nodes[k]) { gg.nodes[k].x = (gg.nodes[k].x ?? 0) + dx; gg.nodes[k].y = (gg.nodes[k].y ?? 0) + dy } }
        }
      }, !moves.some((c) => c.type === 'position' && c.dragging))
    }
    const sel = changes.flatMap((c) => (c.type === 'select' && c.selected ? [c.id] : []))
    if (sel.length === 1 && sel[0] !== store.graph.selected) {
      lastSelected.current = sel[0]
      store.update((g) => { g.selected = sel[0] }, true)
    }
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const g = useGraph.getState().graph
    if (!c.source || !c.target || c.source === c.target) return
    const a = g.nodes[c.source], b = g.nodes[c.target]
    if (!a || !b || a.kind === 'transform' || b.kind === 'transform') return
    useUI.getState().set({ collision: { a: c.source, b: c.target }, pickerFor: null })
  }, [])
  const isValidConnection = useCallback((c: Connection | Edge) => {
    const g = useGraph.getState().graph
    const a = g.nodes[c.source], b = g.nodes[c.target]
    return !!a && !!b && c.source !== c.target && a.kind !== 'transform' && b.kind !== 'transform'
  }, [])

  const onBeforeDelete = useCallback(async ({ nodes: del }: { nodes: Node[]; edges: Edge[] }) => {
    if (!del.length) return false
    if (!window.confirm(del.length > 1 ? `Delete these ${del.length} boxes and everything that grew from them?` : 'Delete this box and everything that grew from it?')) return false
    useGraph.getState().remove(del.map((n) => n.id))
    return false   // the store did it
  }, [])

  const empty = graph.order.length === 0
  return (
    <div ref={wrap} className="relative h-full min-h-[420px] w-full">
      <ReactFlow
        nodes={nodes} edges={built.es} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onConnect={onConnect} isValidConnection={isValidConnection}
        onBeforeDelete={onBeforeDelete} deleteKeyCode={['Delete', 'Backspace']}
        connectionMode={ConnectionMode.Loose} connectionRadius={36}
        onPaneClick={() => useUI.getState().set({ pickerFor: null })}
        onNodeDoubleClick={(_, n) => { if (n.type !== 'transform') useUI.getState().set({ pickerFor: n.id }) }}
        fitView fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }} minZoom={0.15} maxZoom={2.5}
        selectionOnDrag={false} panOnDrag multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        proOptions={{ hideAttribution: true }} colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="color-mix(in oklch, var(--foreground) 14%, transparent)" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => (n.type === 'transform' ? 'var(--chart-3)' : n.type === 'source' ? 'var(--chart-2)' : 'var(--muted-foreground)')}
          maskColor="color-mix(in oklch, var(--background) 70%, transparent)" className="max-md:!hidden" />
      </ReactFlow>
      {empty && <EmptyMap />}
    </div>
  )
}

function descendantsIn(g: ReturnType<typeof useGraph.getState>['graph'], id: string): string[] {
  const out: string[] = []
  const seen = new Set([id])
  const walk = (k: string) => {
    for (const c of g.order) {
      const n = g.nodes[c]
      if ((n.parent === k || (n.kind === 'transform' && n.parent2 === k)) && !seen.has(c)) { seen.add(c); out.push(c); walk(c) }
    }
  }
  walk(id)
  return out
}

/** A short tutorial on the empty map, with an example to start from. */
function EmptyMap() {
  const moves = useMoves((s) => s.moves)
  const mode = useSettings((s) => s.mode)
  const anchor = moves?.modes[mode]?.anchor || ''
  const steps = [
    ['Start with a concept.', 'Type it on the left and press a move. Each press adds the move and its best result; “1 of 3” shows the other two.'],
    ['Keep going.', 'Select any result and press another move. Every result is a full concept, so the map can grow as deep as you like.'],
    ['Collide two boxes.', 'Drag from the dot on the right of one box onto another box. Collisions tend to give the strongest ideas.'],
    ['Teach it your taste.', 'Keep and Discard on a result steer every later press, toward what you keep and away from what you throw out.'],
  ]
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 max-md:p-3">
      <div className="pointer-events-auto max-w-md space-y-3 rounded-md border border-border bg-card/90 p-5 max-md:p-4 text-sm shadow-sm">
        <ol className="space-y-2">
          {steps.map(([head, body], i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-primary/20 text-xs font-semibold text-primary">{i + 1}</span>
              <span className="text-muted-foreground"><b className="text-foreground">{head}</b> {body}</span>
            </li>
          ))}
        </ol>
        {anchor && (
          <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal py-1.5 text-left" onClick={() => useGraph.getState().plant(anchor.replace(/\.$/, ''))}>
            Start with an example: {anchor.replace(/\.$/, '')}
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground max-md:hidden">
          Keys: {SHORTCUTS.map(([k, what]) => `${k} ${what}`).join(' · ')}
        </p>
      </div>
    </div>
  )
}
