// "Highlight what changed": a result shown against the text that went into it, so a transform explains itself on the
// visitor's own concept. When the change is the smaller part, the new words are bold; when almost everything is new,
// the few words that survived from the input are underlined instead. A menu switch turns it off.
import { wordDiff } from '@/lib/diff'
import { useSettings } from '@/store/settings'

export function ChangedText({ before, after }: { before: string; after: string }) {
  const on = useSettings((s) => s.showChanges)
  if (!on || !before.trim() || !after.trim()) return <>{after}</>
  const shown = wordDiff(before, after).parts.filter((p) => p.k !== 'del')
  const kept = shown.filter((p) => p.k === 'same').length
  if (!kept) return <>{after}</>
  const markNew = shown.length - kept <= shown.length * 0.6
  return (
    <span title={markNew ? 'Bold: what this transform changed' : 'Underlined: what survived from the input'}>
      {shown.map((p, i) => {
        const w = p.w + (i < shown.length - 1 ? ' ' : '')
        if (markNew) return p.k === 'add' ? <b key={i} className="font-semibold text-foreground">{w}</b> : <span key={i}>{w}</span>
        return p.k === 'same'
          ? <span key={i} className="underline decoration-primary/70 decoration-dotted underline-offset-[3px]">{w}</span>
          : <span key={i}>{w}</span>
      })}
    </span>
  )
}
