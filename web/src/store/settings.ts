// Visitor settings, remembered in this browser: engine, result mode, length per mode, stacking, view.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Engine, ModeId, Provider } from '@/lib/types'

export const DEFAULT_WORDS: Record<ModeId, number> = { image: 16, ideas: 30 }

interface Settings {
  engine: Engine
  mode: ModeId
  words: Record<ModeId, number>        // 0 = the mode's default (not sent)
  showChanges: boolean
  stacking: boolean
  stack: string[]                      // picked move ids while stacking
  view: 'map' | 'outline'
  provider: Provider                   // the own-key panel's provider
  useOwn: boolean                      // presses use the visitor's own key
  useOwnProvider: Provider
  set: (p: Partial<Omit<Settings, 'set'>>) => void
}

export const useSettings = create<Settings>()(persist((set) => ({
  engine: 'gemini',
  mode: 'image',
  words: { image: 0, ideas: 0 },
  showChanges: true,
  stacking: false,
  stack: [],
  view: 'map',
  provider: 'gemini',
  useOwn: false,
  useOwnProvider: 'gemini',
  set: (p) => set(p),
}), {
  name: 'ct.settings.v3',
  partialize: (s) => ({ engine: s.engine, mode: s.mode, words: s.words, showChanges: s.showChanges, view: s.view,
    provider: s.provider, useOwn: s.useOwn, useOwnProvider: s.useOwnProvider }),
}))

export const wordsFor = (mode: ModeId) => useSettings.getState().words[mode] || 0
