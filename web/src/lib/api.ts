// Talking to relay.php: every press goes through it (it holds the prompts and the site's free keys).
// A visitor's own key rides along with their press, is used for that one request, and is never stored there.
import { create } from 'zustand'
import { ownKey } from './storage'
import type { MoveDef, MovesFile, ModeId, Provider } from './types'
import { useSettings } from '@/store/settings'

export const ENGINES = { gemini: 'Gemini Flash', groq: 'Groq GPT OSS' } as const
export const PROVIDERS: Record<Provider, string> = { gemini: 'Gemini', groq: 'Groq', claude: 'Claude', openai: 'OpenAI' }

// ── the move list ──
interface MovesStore { moves: MovesFile | null; error: string; load: () => Promise<void> }
export const useMoves = create<MovesStore>()((set) => ({
  moves: null,
  error: '',
  load: async () => {
    try {
      const r = await fetch('moves.json', { cache: 'no-cache' })
      set({ moves: await r.json(), error: '' })
    } catch {
      set({ error: 'The moves did not load. Reload the page.' })
    }
  },
}))
export const moveById = (id: string): MoveDef | undefined => useMoves.getState().moves?.moves.find((m) => m.id === id)
export const labelOf = (m: MoveDef | undefined, mode: ModeId) => (m ? m.label[mode] || m.label.image : '')

export class FriendlyError extends Error {
  openKey: boolean
  constructor(message: string, openKey = false) { super(message); this.openKey = openKey }
}

export interface PressRequest {
  move: string                // move id, or 'stack'
  moves?: string[]            // for a stack
  mode: ModeId
  words: number
  concept: string
  concept2?: string           // a collision's second box
  field?: string
  field2?: string
  taste?: { kept: string[]; discarded: string[] }
}

export interface PressResult { variants: string[]; engine: string; note: string; card: string }

/** Which engine a press goes to right now, and how to name it. */
export function currentEngine(): { own: Provider | null; label: string } {
  const s = useSettings.getState()
  const p = s.useOwnProvider
  if (s.useOwn && ownKey(p)) return { own: p, label: `your ${PROVIDERS[p]} key` }
  return { own: null, label: ENGINES[s.engine] }
}

export async function callRelay(req: PressRequest, count: number, signal?: AbortSignal): Promise<PressResult> {
  const s = useSettings.getState()
  const { own } = currentEngine()
  const body: Record<string, unknown> = { engine: own ? `own:${own}` : s.engine, move: req.move, mode: req.mode, concept: req.concept }
  if (req.words) body.words = req.words
  if (req.field) body.field = req.field
  if (req.field2) body.field2 = req.field2
  if (req.concept2) body.concept2 = req.concept2
  if (req.moves) body.moves = req.moves
  if (req.taste && (req.taste.kept.length || req.taste.discarded.length)) body.taste = req.taste
  if (own) body.key = ownKey(own)
  let r: Response
  try {
    r = await fetch('relay.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
  } catch (e) {
    if (signal?.aborted || (e as Error)?.name === 'AbortError') throw new FriendlyError('Stopped.')
    throw new FriendlyError("Couldn't reach the site. Check your connection and try again.")
  }
  let b: { variants?: string[]; engine?: string; note?: string; card?: string; message?: string; error?: string } = {}
  try { b = await r.json() } catch { b = {} }
  if (r.ok && Array.isArray(b.variants) && b.variants.length) {
    const engine = b.engine && b.engine in ENGINES ? ENGINES[b.engine as keyof typeof ENGINES] : currentEngine().label
    return { variants: b.variants.slice(0, count || 3), engine, note: b.note || '', card: typeof b.card === 'string' ? b.card : '' }
  }
  const openKey = own ? b.error === 'key' : ['allowance', 'rate', 'busy'].includes(b.error || '')
  throw new FriendlyError(b.message || 'Something went wrong. Press Run again.', openKey)
}
