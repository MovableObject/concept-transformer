// Running transforms, like cooking in Houdini: nothing runs on its own. Run on a node runs whatever above it needs
// running first, then the node; Run all runs every transform that needs it, inputs first. One engine call per node.
import { callRelay, currentEngine, FriendlyError, labelOf, moveById, useMoves } from './api'
import { outputOf, runAllPlan, runPlan } from './graph'
import { tasteLists } from './taste'
import type { TransformBox } from './types'
import { useGraph } from '@/store/graph'
import { useUI } from '@/store/ui'

let stopper: AbortController | null = null

/** Stop the run in progress: the call being made is abandoned, nothing after it starts. */
export function stopRun() { stopper?.abort() }

/** Check a transform can run, and say what is missing in plain words if not. */
function problemWith(t: TransformBox): string {
  const g = useGraph.getState().graph
  const def = moveById(t.moveIds[0])
  if (!def) return 'This transform’s move is not on the site any more. Delete it and add another.'
  const need = def.inputs === 2 ? 2 : 1
  for (let i = 0; i < need; i++) {
    const src = t.inputs[i]
    if (!src || !g.nodes[src]) return need === 2 ? 'A collision needs two inputs: wire a box into each dot on its top.' : 'Wire a concept into the dot on its top first.'
    if (!outputOf(g, src)) return 'An input has no text yet: type into it, or run the transform it comes from.'
    if (g.nodes[src].kind === 'source' && need !== 2) return 'A source only goes into a collision.'
  }
  if (def.field && !def.field.optional && !def.deck && !t.field.trim()) return `Fill in “${def.field.label}” for this transform first (select it to see its settings).`
  return ''
}

async function runOne(id: string, signal: AbortSignal): Promise<boolean> {
  const store = useGraph.getState()
  const t = store.graph.nodes[id]
  if (t?.kind !== 'transform') return true
  const problem = problemWith(t)
  if (problem) { store.failRun(id, problem); return false }
  const g = store.graph
  const def = moveById(t.moveIds[0])!
  const stack = t.moveIds.length > 1
  const key = store.startRun(id)
  try {
    const r = await callRelay({
      move: stack ? 'stack' : def.id, moves: stack ? t.moveIds : undefined, mode: t.mode, words: t.words,
      concept: outputOf(g, t.inputs[0]), concept2: def.inputs === 2 ? outputOf(g, t.inputs[1]) : undefined,
      field: def.deck ? '' : t.field.trim(), field2: t.field2.trim(), taste: tasteLists(),
    }, def.count || 3, signal)
    const modeLabel = useMoves.getState().moves?.modes[t.mode]?.label || t.mode
    useGraph.getState().finishRun(id, key, r.variants, `${r.engine} · ${modeLabel}`, r.note, r.card)
    return true
  } catch (e) {
    const msg = e instanceof FriendlyError ? e.message : 'Something went wrong. Press Run again.'
    useGraph.getState().failRun(id, msg)
    if (e instanceof FriendlyError && e.openKey) useUI.getState().set({ keyPanelOpen: true })
    if (!(e instanceof FriendlyError)) console.error(e)
    return false
  }
}

async function runList(plan: string[]) {
  const ui = useUI.getState()
  if (ui.busy || !plan.length) return
  stopper = new AbortController()
  const signal = stopper.signal
  ui.set({ busy: true })
  const failed = new Set<string>()
  try {
    for (const id of plan) {
      if (signal.aborted) break
      const t = useGraph.getState().graph.nodes[id]
      if (t?.kind !== 'transform') continue
      if (t.inputs.some((i) => i && failed.has(i))) { failed.add(id); continue }   // its input did not run
      const ok = await runOne(id, signal)
      if (!ok) failed.add(id)
    }
  } finally {
    stopper = null
    useUI.getState().set({ busy: false })
  }
  if (failed.size) {
    const first = [...failed].map((i) => useGraph.getState().graph.nodes[i]).find((n) => n?.kind === 'transform' && n.error) as TransformBox | undefined
    if (first) {
      const name = labelOf(moveById(first.moveIds[0]), first.mode) || 'A transform'
      useUI.getState().toast(`${name}: ${first.error}`, 'error')
    }
  }
}

/** Run these transforms, after anything above them that needs it. Already up-to-date ones run again. */
export function runNodes(ids: string[]) {
  const g = useGraph.getState().graph
  const ts = ids.filter((i) => g.nodes[i]?.kind === 'transform')
  if (!ts.length) { useUI.getState().toast('Select a transform to run.'); return }
  void runList(runPlan(g, ts, true))
}

/** Run everything that needs it. */
export function runAll() {
  const plan = runAllPlan(useGraph.getState().graph)
  if (!plan.length) { useUI.getState().toast('Everything is up to date.'); return }
  void runList(plan)
}

/** Which engine runs will use, for labels. */
export const engineLabel = () => currentEngine().label
