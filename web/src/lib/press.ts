// One press: a move is applied to a box (or two boxes, for a collision); a transform box appears at once and its
// results fill in when they arrive. Results are full concepts again, so any of them can be pressed on in turn.
import { callRelay, currentEngine, FriendlyError, labelOf, moveById, useMoves } from './api'
import type { MoveDef, ModeId, TransformBox } from './types'
import { useGraph, nodeOf, shownResult } from '@/store/graph'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { tasteLists } from './taste'

/** The box a move applies to: the typed concept (planted first), else the selected concept or source, else a
 *  selected transform's shown result (or its source while it has none). */
export function targetId(): string | null {
  const g = useGraph.getState().graph
  const sel = g.selected ? g.nodes[g.selected] : null
  if (!sel) return null
  if (sel.kind !== 'transform') return sel.id
  return shownResult(g, sel.id) || sel.parent
}

export function ensureTarget(): string | null {
  const ui = useUI.getState()
  const typed = ui.draft.trim()
  if (typed) {
    const id = useGraph.getState().plant(typed)
    ui.set({ draft: '' })
    return id
  }
  return targetId()
}

const textOf = (id: string) => { const n = nodeOf(id); return n ? (n.kind === 'transform' ? '' : n.plain || n.text) : '' }

function stackDef(ids: string[]): MoveDef {
  const parts = ids.map(moveById).filter(Boolean) as MoveDef[]
  const label = { image: parts.map((m) => m.label.image).join(' + '), ideas: parts.map((m) => m.label.ideas).join(' + ') }
  return { id: 'stack', group: '', label, blurb: { image: '', ideas: '' }, example: { image: '', ideas: '' }, count: 3, stackable: false }
}

interface RunOptions {
  parents?: string[]        // explicit boxes (Run again, collisions); otherwise the target
  field?: string
  field2?: string
  mode?: ModeId
  words?: number
  stackIds?: string[]
}

export async function runMove(moveId: string, opts: RunOptions = {}) {
  const ui = useUI.getState()
  if (ui.busy) return
  const s = useSettings.getState()
  const isStack = moveId === 'stack'
  const def = isStack ? stackDef(opts.stackIds || s.stack) : moveById(moveId)
  if (!def) return
  const mode = opts.mode || s.mode
  const words = opts.words ?? (s.words[mode] || 0)

  let parents = opts.parents
  if (!parents) {
    const t = ensureTarget()
    if (!t) { ui.toast('Type a concept first, or select a box on the map.'); return }
    parents = [t]
  }
  if (def.inputs === 2 && parents.length < 2) { ui.toast('This move needs two boxes: drag a line from one box to another.'); return }
  if (def.inputs !== 2 && nodeOf(parents[0])?.kind === 'source') {
    ui.toast('A source is for collisions: drag a line from it onto another box.')
    return
  }

  // Oblique Strategies: the server draws the card from its private deck and sends it back with the results.
  const field = def.deck ? '' : opts.field ?? (def.field ? (ui.fields[def.id] || '').trim() : '')
  if (def.field && !def.field.optional && !def.deck && !field) {
    ui.toast(`Fill in "${def.field.label}" for ${labelOf(def, mode)} first.`)
    return
  }
  const field2 = opts.field2 ?? (def.field2 ? (ui.fields[`${def.id}:2`] || '').trim() : '')

  const base = labelOf(def, mode)
  const label = field ? `${base.replace(/ with$/, '')} → ${field}` : base
  const engine = currentEngine()
  const tid = useGraph.getState().beginPress(parents, {
    move: label, moveIds: isStack ? [...(opts.stackIds || s.stack)] : [def.id], field, field2, mode, words,
    engine: `${engine.label} · ${useMoves.getState().moves?.modes[mode].label || mode}`,
  })
  ui.set({ busy: true, pickerFor: null, collision: null })
  try {
    const r = await callRelay({
      move: isStack ? 'stack' : def.id, moves: isStack ? (opts.stackIds || s.stack) : undefined, mode, words,
      concept: textOf(parents[0]), concept2: parents[1] ? textOf(parents[1]) : undefined, field, field2,
      taste: tasteLists(),
    }, def.count || 3)
    useGraph.getState().finishPress(tid, r.variants, `${r.engine} · ${useMoves.getState().moves?.modes[mode].label || mode}`, r.note)
    if (r.card) {
      useGraph.getState().update((g) => {
        const t = g.nodes[tid]
        if (t && t.kind === 'transform') { t.move = `${base}: “${r.card}”`; t.field = r.card }
      })
    }
  } catch (e) {
    const msg = e instanceof FriendlyError ? e.message : 'Something went wrong. Press the move again.'
    useGraph.getState().failPress(tid, msg)
    if (e instanceof FriendlyError && e.openKey) useUI.getState().set({ keyPanelOpen: true })
    if (!(e instanceof FriendlyError)) console.error(e)
  } finally {
    useUI.getState().set({ busy: false })
  }
}

/** Run a stored press again on the same box(es), with the same move(s), mode, length and boxes. */
export function runAgain(t: TransformBox) {
  const parents = [t.parent, t.parent2].filter(Boolean) as string[]
  if (t.moveIds.length > 1) return runMove('stack', { parents, stackIds: t.moveIds, mode: t.mode, words: t.words })
  const def = moveById(t.moveIds[0])
  return runMove(t.moveIds[0], { parents, field: def?.deck ? '' : t.field, field2: t.field2, mode: t.mode, words: t.words })
}

/** A button press from the side panel or a picker: stack it or run it. */
export function pick(m: MoveDef) {
  const s = useSettings.getState()
  if (s.stacking) {
    if (!m.stackable) return
    const has = s.stack.includes(m.id)
    if (has) s.set({ stack: s.stack.filter((x) => x !== m.id) })
    else if (s.stack.length < (useMoves.getState().moves?.stack_max || 3)) s.set({ stack: [...s.stack, m.id] })
    else useUI.getState().toast('Up to three moves in a stack. Unpick one first.')
    return
  }
  if (m.inputs === 2) {
    const sel = targetId()
    useUI.getState().toast(sel ? 'Collisions need two boxes: drag from the dot on the right of one box onto another box.'
      : 'Put two concepts on the map, then drag from one box onto the other.')
    return
  }
  void runMove(m.id)
}
