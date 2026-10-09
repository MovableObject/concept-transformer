// The move buttons, by group. Used in the side panel and in the "+" picker on a box.
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { labelOf, useMoves } from '@/lib/api'
import { pick } from '@/lib/press'
import type { MoveDef } from '@/lib/types'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'

const EVIDENCE: Record<string, string> = {
  strong: 'Tested strong in the studio’s blind tests.',
  mixed: 'Mixed in the studio’s tests: good on some concepts, weak on others.',
  drifts: 'Tends to drift away from the concept in the studio’s tests; use it as a jolt.',
}

const GROUP_TIPS: Record<string, string> = {
  SCAMPER: 'A classic checklist for changing an idea, named for its seven moves: Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Reverse.',
  Collisions: 'Moves that take two boxes and force them into one new idea. Drag from the dot on one box onto another to use them. Usually the strongest results.',
  Perceptual: 'Change how the thing is seen: flip it, describe it as if seen for the first time, break the rule that defines it, or state something impossible about it.',
  'Scale and abstraction': 'Move up or down: make it far bigger or smaller, climb to what it is an example of, or come down to one specific real case.',
  Substitution: 'Swap the thing for something that stands in for it: one of its parts, something next to it, or something from another world that feels the same.',
  Structural: 'Keep the skeleton and rebuild the rest: move it into another field, find the rule that makes it, misuse a tool to make it, or turn it into its own paperwork.',
  Linguistic: 'Work through words: dig up the old meaning of a word in it, or pass it through other languages and keep what drifts.',
  Constraints: 'Add a rule it must obey, refuse the thing it does best, or write it under a word game, and see what the limit forces.',
  'Chance and games': 'Let chance push it: a random card of creative advice, free association, or a fresh start from its last word.',
  Shifts: "Same idea, different angle: another person's point of view, another era, another mood, or squeezed down to its core.",
}

export function MoveTip({ m }: { m: MoveDef }) {
  const mode = useSettings((s) => s.mode)
  return (
    <div className="max-w-80 space-y-1.5 text-left">
      <p>{m.blurb[mode]}</p>
      <p className="opacity-80">e.g. {m.example[mode]}</p>
      {m.evidence && <p className="opacity-70 text-xs">{m.evidenceNote || EVIDENCE[m.evidence]}</p>}
    </div>
  )
}

export function MoveButton({ m, compact, onDone }: { m: MoveDef; compact?: boolean; onDone?: () => void }) {
  const mode = useSettings((s) => s.mode)
  const stacking = useSettings((s) => s.stacking)
  const picked = useSettings((s) => s.stack.includes(m.id))
  const busy = useUI((s) => s.busy)
  const disabled = busy || (stacking && !m.stackable)
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <Button
          variant="outline" size="sm" disabled={disabled} data-move={m.id}
          className={cn('h-7 px-2.5 text-[13px] font-medium', compact && 'h-7', picked && 'border-primary bg-primary/20',
            m.inputs === 2 && 'border-dashed')}
          onClick={() => { pick(m); if (!useSettings.getState().stacking) onDone?.() }}
        >
          {labelOf(m, mode)}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right"><MoveTip m={m} /></TooltipContent>
    </Tooltip>
  )
}

export function FieldInput({ m }: { m: MoveDef }) {
  const value = useUI((s) => s.fields[m.id] || '')
  if (!m.field || m.deck) return null
  return (
    <Input
      className="h-7 text-[13px]" value={value} maxLength={m.field.max} data-field={m.id}
      placeholder={m.field.placeholder || m.field.label}
      onChange={(e) => useUI.getState().set({ fields: { ...useUI.getState().fields, [m.id]: e.target.value } })}
      onKeyDown={(e) => { if (e.key === 'Enter') pick(m) }}
    />
  )
}

export function MoveGroups({ compact, onDone, only }: { compact?: boolean; onDone?: () => void; only?: (m: MoveDef) => boolean }) {
  const moves = useMoves((s) => s.moves)
  if (!moves) return null
  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {moves.groups.map((g) => {
        const list = moves.moves.filter((m) => m.group === g && (!only || only(m)))
        if (!list.length) return null
        return (
          <div key={g}>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <h3 className="mb-1.5 w-fit cursor-help text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</h3>
              </TooltipTrigger>
              {GROUP_TIPS[g] && <TooltipContent side="right" className="max-w-72 normal-case">{GROUP_TIPS[g]}</TooltipContent>}
            </Tooltip>
            <div className="flex flex-wrap gap-1.5">
              {list.map((m) => <MoveButton key={m.id} m={m} compact={compact} onDone={onDone} />)}
            </div>
            {!compact && list.filter((m) => m.field && !m.deck).map((m) => (
              <div key={m.id} className="mt-1.5"><FieldInput m={m} /></div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
