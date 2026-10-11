// Visitor settings, remembered in this browser: engine, the result mode and length new transforms start with, view.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Engine, ModeId, Provider } from '@/lib/types'

export const DEFAULT_WORDS: Record<ModeId, number> = { image: 16, ideas: 30 }

interface Settings {
  engine: Engine
  mode: ModeId
  words: Record<ModeId, number>        // 0 = the mode's default (not sent)
  showChanges: boolean
  view: 'map' | 'outline'
  sidebar: boolean                     // the left panel is open (it starts collapsed)
  minimap: boolean                     // the overview map in the corner (off unless asked for)
  params: boolean                      // the parameter pane on the right is open
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
  view: 'map',
  sidebar: false,
  minimap: false,
  params: true,
  provider: 'gemini',
  useOwn: false,
  useOwnProvider: 'gemini',
  set: (p) => set(p),
}), {
  name: 'ct.settings.v3',
  partialize: (s) => ({ engine: s.engine, mode: s.mode, words: s.words, showChanges: s.showChanges, view: s.view, sidebar: s.sidebar, minimap: s.minimap, params: s.params,
    provider: s.provider, useOwn: s.useOwn, useOwnProvider: s.useOwnProvider }),
}))

export const wordsFor = (mode: ModeId) => useSettings.getState().words[mode] || 0
