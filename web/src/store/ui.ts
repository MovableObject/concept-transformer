// Page state that is not remembered between visits.
import { create } from 'zustand'

export interface Toast { id: number; text: string; tone: 'info' | 'error' }

/** The Tab menu: where it opens on screen, where a new node lands on the map, and what to wire it to. */
export interface TabMenu {
  sx: number                  // screen position
  sy: number
  at?: { x: number; y: number }   // map position for the new node (else beside its inputs)
  inputs: string[]            // nodes to wire into the new transform, in port order
  collideOnly?: boolean       // dropped a wire onto a box: offer only the two-input moves
}

interface UI {
  busy: boolean               // a run is in progress
  keyPanelOpen: boolean
  tabMenu: TabMenu | null
  editing: string | null      // the concept, source or note being typed into on the map
  toasts: Toast[]
  set: (p: Partial<Omit<UI, 'set' | 'toast'>>) => void
  toast: (text: string, tone?: Toast['tone']) => void
}

let tid = 0
export const useUI = create<UI>()((set, get) => ({
  busy: false,
  keyPanelOpen: false,
  tabMenu: null,
  editing: null,
  toasts: [],
  set: (p) => set(p),
  toast: (text, tone = 'info') => {
    const id = ++tid
    set({ toasts: [...get().toasts, { id, text, tone }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), tone === 'error' ? 7000 : 3500)
  },
}))
