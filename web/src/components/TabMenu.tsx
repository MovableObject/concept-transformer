// The Tab menu, as in Houdini: a searchable list of everything that can be added, opened at the pointer.
// Picking a move adds a transform there, wired to the node it was opened from. Nothing runs until Run.
import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Quote, StickyNote } from 'lucide-react'
import { labelOf, useMoves } from '@/lib/api'
import { addMove, addText } from '@/lib/actions'
import { cn } from '@/lib/utils'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { GroupDot, MoveIcon } from './MoveIcon'

interface Item { key: string; label: string; group: string; hint: string; pick: () => void; icon: React.ReactNode }

export function TabMenu() {
  const menu = useUI((u) => u.tabMenu)
  const moves = useMoves((s) => s.moves)
  const mode = useSettings((s) => s.mode)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(''); setHi(0) }, [menu])
  useEffect(() => {
    if (!menu) return
    const off = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) useUI.getState().set({ tabMenu: null }) }
    window.addEventListener('pointerdown', off, true)
    return () => window.removeEventListener('pointerdown', off, true)
  }, [menu])

  const items = useMemo<Item[]>(() => {
    if (!menu || !moves) return []
    const out: Item[] = []
    const needle = q.trim().toLowerCase()
    const fits = (...s: string[]) => !needle || s.some((x) => x.toLowerCase().includes(needle))
    if (!menu.collideOnly && !menu.inputs.length) {
      const basics: [string, 'concept' | 'source' | 'note', string, React.ReactNode][] = [
        ['Concept', 'concept', 'A box you type an idea into', <FileText key="c" className="size-[18px]" />],
        ['Source', 'source', 'A pasted passage to collide with', <Quote key="s" className="size-[18px]" />],
        ['Note', 'note', 'A sticky note for yourself', <StickyNote key="n" className="size-[18px]" />],
      ]
      for (const [label, kind, hint, icon] of basics) {
        if (fits(label, hint)) out.push({ key: kind, label, group: 'Add', hint, icon, pick: () => addText(kind, menu.at) })
      }
    }
    for (const g of [...moves.groups, 'Finish']) {
      for (const m of moves.moves.filter((x) => x.group === g)) {
        if (menu.collideOnly && m.inputs !== 2) continue
        const label = labelOf(m, mode)
        if (!fits(label, g, m.blurb[mode])) continue
        out.push({ key: m.id, label, group: g, hint: m.blurb[mode], icon: <MoveIcon id={m.id} />,
          pick: () => addMove(m.id, { inputs: menu.inputs, at: menu.at }) })
      }
    }
    if (!needle) return out
    // with a search, best matches first: name starts with it, then name contains it, then the rest
    const score = (it: Item) => (it.label.toLowerCase().startsWith(needle) ? 0 : it.label.toLowerCase().includes(needle) ? 1 : 2)
    return out.map((it, i) => ({ it, i })).sort((a, b) => score(a.it) - score(b.it) || a.i - b.i).map((x) => x.it)
  }, [menu, moves, mode, q])

  useEffect(() => { if (hi >= items.length) setHi(Math.max(0, items.length - 1)) }, [items.length, hi])
  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi])

  if (!menu) return null
  const W = 300, H = 380
  const left = Math.max(8, Math.min(menu.sx, window.innerWidth - W - 8))
  const top = Math.max(8, Math.min(menu.sy, window.innerHeight - H - 8))
  let lastGroup = ''
  return (
    <div ref={box} role="dialog" aria-label="Add a node" className="fixed z-50 flex flex-col overflow-hidden rounded-[4px] border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ left, top, width: W, maxHeight: H }}>
      <div className="border-b border-border p-2">
        <input autoFocus value={q} placeholder={menu.collideOnly ? 'Collide them with…' : menu.inputs.length ? 'Transform it with…' : 'Add a node…'}
          className="w-full rounded-[3px] border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(e) => { setQ(e.target.value); setHi(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); items[hi]?.pick() }
            else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); useUI.getState().set({ tabMenu: null }) }
          }} />
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto py-1">
        {!items.length && <p className="px-3 py-2 text-sm text-muted-foreground">Nothing matches.</p>}
        {items.map((it, i) => {
          const head = !q.trim() && it.group !== lastGroup ? (lastGroup = it.group) : ''
          return (
            <div key={it.key}>
              {head && (
                <div className="mt-1 flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <GroupDot group={head} />{head}
                </div>
              )}
              <button data-i={i} title={it.hint}
                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === hi ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}
                onMouseEnter={() => setHi(i)} onClick={() => it.pick()}>
                {it.icon}<span className="truncate">{it.label}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
