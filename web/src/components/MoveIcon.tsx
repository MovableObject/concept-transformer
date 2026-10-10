// A move's symbol, in its group's color. The markup comes from the owner's picks (tools/export_move_icons.py) and is
// our own, cleaned at export, so it is set as inner HTML of a fixed SVG wrapper at the site's icon weight.
import { moveById } from '@/lib/api'
import { GROUP_HUES, MOVE_ICONS } from '@/lib/moveIcons'
import { cn } from '@/lib/utils'

/** The group's color for icons and markers on the dark theme. */
export function groupColor(group?: string): string | undefined {
  const h = group ? GROUP_HUES[group] : undefined
  return h === undefined ? undefined : `oklch(0.8 0.12 ${h})`
}

export function MoveIcon({ id, className, plain }: { id: string; className?: string; plain?: boolean }) {
  const markup = MOVE_ICONS[id]
  if (!markup) return null
  const color = plain ? undefined : groupColor(moveById(id)?.group)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className={cn('size-[18px] shrink-0', className)} style={color ? { color } : undefined}
      dangerouslySetInnerHTML={{ __html: markup }} />
  )
}

/** A small swatch in the group's color, for group headings. */
export function GroupDot({ group }: { group: string }) {
  const color = groupColor(group)
  return color ? <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: color }} /> : null
}
