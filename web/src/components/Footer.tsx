import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/utils'

/** What the site sends and keeps, opened from the menu. */
export function PrivacyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Privacy</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p><b className="text-foreground">What is sent.</b> Each run of a transform sends what is wired into it (or the two boxes being collided), the move and your settings to this site, which adds its own instructions and passes them to the AI engine: Google Gemini, Groq, Anthropic Claude or OpenAI. The answer comes straight back to you. The free engines may use what you send to improve their models, so don't type anything private.</p>
            <p><b className="text-foreground">Your keeps and discards.</b> If you keep or discard results, your newest few of each are sent along with each run so the engine can aim for what you like. They live only in this browser.</p>
            <p><b className="text-foreground">What is kept.</b> Nothing you type is saved on this site. The map lives only in this browser, and in map files you save yourself. To share the free allowance fairly, the site keeps a count of runs per visitor for one hour, under a scrambled code made from your internet address, never the address itself, and a total per engine for the day.</p>
            <p><b className="text-foreground">Your own key.</b> It stays in your browser, for this tab only unless you tick Remember. When a transform runs it travels with that one request over an encrypted connection and is used only to call your provider. It is never written to disk or to a log.</p>
            <p><b className="text-foreground">No tracking.</b> No cookies, no analytics, no ads, no code from other sites.</p>
            <p><b className="text-foreground">Check it yourself.</b> <a className="text-primary underline" href="https://github.com/MovableObject/concept-transformer" target="_blank" rel="noopener noreferrer">The site's code is public</a>, including the server file that handles keys.</p>
          </div>
        </DialogContent>
      </Dialog>

  )
}

export function Toasts() {
  const toasts = useUI((u) => u.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[4000] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn('pointer-events-auto max-w-md rounded-[4px] border px-4 py-2 text-sm shadow-lg',
          t.tone === 'error' ? 'border-destructive bg-card text-destructive' : 'border-border bg-popover text-popover-foreground')}>{t.text}</div>
      ))}
    </div>
  )
}
