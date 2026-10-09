// Page state that is not remembered between visits.
import { create } from 'zustand'

export interface Toast { id: number; text: string; tone: 'info' | 'error' }

interface UI {
  draft: string                         // the New concept box
  busy: boolean
  keyPanelOpen: boolean
  pickerFor: string | null              // the box whose "+" picker is open
  collision: { a: string; b: string } | null   // two boxes waiting for a collision move
  fields: Record<string, string>        // second boxes typed in the side panel, by move id
  toasts: Toast[]
  set: (p: Partial<Omit<UI, 'set' | 'toast'>>) => void
  toast: (text: string, tone?: Toast['tone']) => void
}

let tid = 0
export const useUI = create<UI>()((set, get) => ({
  draft: '',
  busy: false,
  keyPanelOpen: false,
  pickerFor: null,
  collision: null,
  fields: {},
  toasts: [],
  set: (p) => set(p),
  toast: (text, tone = 'info') => {
    const id = ++tid
    set({ toasts: [...get().toasts, { id, text, tone }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), tone === 'error' ? 7000 : 3500)
  },
}))
