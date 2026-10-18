// The example map: a finished graph, already run by Claude Opus, opened from the menu or the empty map. It replaces
// the map on screen as one undo step, so Ctrl+Z brings the visitor's own map back. Nothing runs.
import { EXAMPLE_MAP } from './exampleMap'
import { splitTag } from './diff'
import { keyOf } from './graph'
import { mapHooks } from './mapHooks'
import type { Graph, MapBox, TransformBox } from './types'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'

export function buildExample(): Graph {
  const now = Date.now()
  const g: Graph = { v: 4, nodes: {}, order: [...EXAMPLE_MAP.order], selected: EXAMPLE_MAP.selected, display: EXAMPLE_MAP.display }
  for (const id of EXAMPLE_MAP.order) {
    const n = EXAMPLE_MAP.nodes[id as keyof typeof EXAMPLE_MAP.nodes] as Record<string, unknown>
    if (n.kind === 'transform') {
      const variants = n.variants as readonly string[]
      g.nodes[id] = {
        id, kind: 'transform', moveIds: [...(n.moveIds as readonly string[])], inputs: [...(n.inputs as readonly string[])],
        field: '', field2: '', mode: 'ideas', words: n.words as number, shown: 0, status: 'idle', error: '',
        engine: 'Claude Opus · example', note: '', card: '', ranKey: '', x: n.x as number, y: n.y as number, time: now,
        results: variants.map((v) => { const { body, tag } = splitTag(v); return { text: v, plain: body, tag } }),
      } as TransformBox
    } else {
      g.nodes[id] = { id, kind: n.kind, text: n.text, x: n.x, y: n.y, time: now } as MapBox
    }
  }
  // inputs come first in the order, so each transform's key can be taken from finished inputs
  for (const id of g.order) {
    const t = g.nodes[id]
    if (t.kind === 'transform') t.ranKey = keyOf(g, t)
  }
  return g
}

export function openExample() {
  useGraph.getState().replace(buildExample())
  useUI.getState().set({ tabMenu: null })
  useUI.getState().toast('Example map opened. Ctrl+Z brings back your own map.')
  setTimeout(() => mapHooks.fit(), 120)
}
