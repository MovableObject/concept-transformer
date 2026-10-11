// Houdini's display flag. In manual mode (the default) the Cook button runs the chain down to the flagged transform.
// With automatic cooking on (the menu): when something above the flagged transform changes (a concept's text, a setting, a wire),
// the chain down to it runs by itself, a moment after the change settles. Everything else waits for Run. Results
// written by hand are left alone (runPlan skips them). A chain that cannot run yet (an unwired input, an empty
// concept) waits; one that just failed is not retried until something in it changes.
import { keyOf, outputOf, portsOf, runPlan } from './graph'
import { moveById } from './api'
import { runList } from './cook'
import { useGraph } from '@/store/graph'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'

const SETTLE_MS = 1500
let timer: ReturnType<typeof setTimeout> | undefined
let lastTried = ''

function plan(): string[] {
  const g = useGraph.getState().graph
  const d = g.display
  if (!d || g.nodes[d]?.kind !== 'transform') return []
  const p = runPlan(g, [d], false)
  for (const id of p) {
    const t = g.nodes[id]
    if (t.kind !== 'transform') return []
    const ports = portsOf(t, moveById(t.moveIds[0]))
    for (let i = 0; i < ports; i++) {
      const src = t.inputs[i]
      if (!src) return []                                           // an input is not wired yet
      if (!p.includes(src) && !outputOf(g, src)) return []          // an input has no text yet
    }
  }
  return p
}

function check() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!useSettings.getState().autoCook || useUI.getState().busy || useUI.getState().editing) return
    const p = plan()
    if (!p.length) return
    const g = useGraph.getState().graph
    const sig = JSON.stringify(p.map((id) => keyOf(g, g.nodes[id] as never)))
    if (sig === lastTried) return                                   // tried this exact state already (it failed)
    lastTried = sig
    void runList(p)
  }, SETTLE_MS)
}

/** The transforms the Cook button would run: what needs it in the chain down to the display flag. */
export function cookPlan(g = useGraph.getState().graph): string[] {
  return g.display && g.nodes[g.display]?.kind === 'transform' ? runPlan(g, [g.display], false) : []
}

/** The Cook button: run the display flag's chain now. */
export function cookDisplay() {
  const g = useGraph.getState().graph
  if (!g.display) { useUI.getState().toast('Put the display flag on a transform first (D).'); return }
  const p = cookPlan(g)
  if (!p.length) { useUI.getState().toast('The display chain is up to date.'); return }
  void runList(p)
}

/** Start watching; call once. */
export function startAutoCook() {
  useGraph.subscribe((s, p) => { if (s.version !== p.version) check() })
  useUI.subscribe((s, p) => { if ((p.busy && !s.busy) || (p.editing && !s.editing)) check() })
  useSettings.subscribe((s, p) => { if (s.autoCook && !p.autoCook) { lastTried = ''; check() } })
  check()
}
