// Title, the free-engine switch and the "Use your own key" panel.
import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ENGINES, PROVIDERS } from '@/lib/api'
import { forgetKey, keyRemembered, ownKey, saveKey } from '@/lib/storage'
import type { Engine, Provider } from '@/lib/types'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'

const KEY_HELP: Record<Provider, [string, string, string]> = {
  gemini: ['In Google AI Studio, create the key in a NEW project and do not set up billing on it. It then runs on the free tier and nothing can be charged.',
    'https://aistudio.google.com/apikey', 'Google AI Studio keys'],
  groq: ['Groq keys on the free plan have no card attached, so nothing can be charged. Make a key just for this site and delete it when you are done.',
    'https://console.groq.com/keys', 'Groq keys'],
  claude: ['In the Claude Console, make a separate workspace with a low monthly spend limit, and create the key inside it.',
    'https://console.anthropic.com/settings/workspaces', 'Claude Console workspaces'],
  openai: ['In the OpenAI dashboard, make a separate project with a low monthly budget, and create the key inside that project.',
    'https://platform.openai.com/settings/organization/projects', 'OpenAI projects'],
}

function KeyPanel() {
  const s = useSettings()
  const [key, setKey] = useState(ownKey(s.provider))
  const [remember, setRemember] = useState(keyRemembered(s.provider))
  useEffect(() => { setKey(ownKey(s.provider)); setRemember(keyRemembered(s.provider)) }, [s.provider])
  const [help, link, linkLabel] = KEY_HELP[s.provider]
  const use = () => {
    if (!key.trim()) return
    saveKey(s.provider, key.trim(), remember)
    s.set({ useOwn: true, useOwnProvider: s.provider })
    useUI.getState().set({ keyPanelOpen: false })
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Select value={s.provider} onValueChange={(v) => s.set({ provider: v as Provider })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(PROVIDERS) as Provider[]).map((p) => <SelectItem key={p} value={p}>{PROVIDERS[p]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ownKey">Key</Label>
        <Input id="ownKey" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your API key"
          value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') use() }} />
      </div>
      <label className="flex items-center gap-2 text-muted-foreground">
        <Checkbox checked={remember} onCheckedChange={(v) => { setRemember(!!v); if (ownKey(s.provider)) saveKey(s.provider, ownKey(s.provider), !!v) }} />
        Remember on this computer
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={use}>Use my key</Button>
        <Button size="sm" variant="outline" disabled={!ownKey(s.provider)} onClick={() => {
          forgetKey(s.provider); setKey('')
          if (s.useOwnProvider === s.provider) s.set({ useOwn: false })
        }}>Forget key</Button>
      </div>
      <Collapsible>
        <CollapsibleTrigger className="text-muted-foreground underline underline-offset-4">How to make a safe key</CollapsibleTrigger>
        <CollapsibleContent className="pt-2 text-muted-foreground space-y-1.5">
          <p>{help} <a className="text-primary underline" href={link} target="_blank" rel="noopener noreferrer">{linkLabel}</a>.</p>
          <p>Use a key made only for this site, and delete it when you have finished trying the site.</p>
        </CollapsibleContent>
      </Collapsible>
      <p className="text-xs text-muted-foreground">
        Your key is kept in this browser tab only, and forgotten when you close it, unless you tick Remember. Each press sends it
        through this site to the provider for that one request; the site never stores or logs it.{' '}
        <a className="text-primary underline" href="https://github.com/MovableObject/concept-transformer/blob/main/relay.php" target="_blank" rel="noopener noreferrer">Read the server code</a>.
      </p>
    </div>
  )
}

export function Header() {
  const s = useSettings()
  const open = useUI((u) => u.keyPanelOpen)
  const own = s.useOwn && !!ownKey(s.useOwnProvider)
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Concept Transformer</h1>
        <p className="text-sm text-muted-foreground">Type a concept, press a move, collide ideas, and grow a map from them.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" variant="outline" size="sm" value={own ? '' : s.engine}
          onValueChange={(v) => { if (v) s.set({ engine: v as Engine, useOwn: false }) }}>
          {(Object.keys(ENGINES) as Engine[]).map((e) => <ToggleGroupItem key={e} value={e} className="px-3">{ENGINES[e]}</ToggleGroupItem>)}
        </ToggleGroup>
        <Popover open={open} onOpenChange={(o) => useUI.getState().set({ keyPanelOpen: o })}>
          <PopoverTrigger asChild>
            <Button variant={own ? 'default' : 'outline'} size="sm"><KeyRound />{own ? `Your ${PROVIDERS[s.useOwnProvider]} key` : 'Use your own key'}</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80"><KeyPanel /></PopoverContent>
        </Popover>
        {own && <Button variant="link" size="sm" className="px-0" onClick={() => s.set({ useOwn: false })}>Back to the free engines</Button>}
      </div>
    </header>
  )
}
