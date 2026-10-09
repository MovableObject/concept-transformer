import { splitTag, wordDiff } from '@/lib/diff'

/** A result's text, with what the move changed against its source (struck = removed, bold = added). */
export function ChangeView({ before, after, show }: { before: string; after: string; show: boolean }) {
  const { body, tag } = splitTag(after)
  if (!show || !before) return <>{body}{tag && <span className="ct-tag"> {tag}</span>}</>
  const { parts, shared } = wordDiff(splitTag(before).body, body)
  const rewrite = shared < 0.25   // a near-total rewrite: a wall of strike-outs is noise
  return (
    <>
      {parts.filter((p) => !(rewrite && p.k === 'del')).map((p, i) => (
        <span key={i}>{i > 0 && ' '}{p.k === 'same' ? p.w : <span className={p.k === 'add' ? 'ct-add' : 'ct-del'}>{p.w}</span>}</span>
      ))}
      {tag && <span className="ct-tag"> {tag}</span>}
    </>
  )
}
