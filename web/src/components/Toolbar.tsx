// The few controls that sit in the header: Run all (or Stop), Undo, and one menu holding everything else, so the
// screen stays the graph. Most of it also has a key, as in Houdini.
import { useRef, useState } from 'react'
import { getNodesBounds, getViewportForBounds, useReactFlow } from '@xyflow/react'
import { toPng } from 'html-to-image'
import { Menu, Play, Square, Undo2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { readMap, useGraph } from '@/store/graph'
import { runAll, stopRun } from '@/lib/cook'
import { runAllPlan } from '@/lib/graph'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { PrivacyDialog } from './Footer'

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href; a.download = name
  document.body.append(a); a.click(); a.remove()
}

/** Fit the whole graph in view (H) and lay it out again (L): shared with the keys. */
export function useMapActions() {
  const rf = useReactFlow()
  const fit = () => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 })
  const tidy = () => {
    const measured: Record<string, { w: number; h: number }> = {}
    for (const n of rf.getNodes()) if (n.measured?.width) measured[n.id] = { w: n.measured.width, h: n.measured.height ?? 60 }
    useGraph.getState().tidy(measured)
    setTimeout(fit, 80)
  }
  return { fit, tidy, rf }
}

export function Toolbar() {
  const s = useSettings()
  const count = useGraph((g) => g.graph.order.length)
  const toRun = useGraph((g) => runAllPlan(g.graph).length)
  const canUndo = useGraph((g) => g.past.length > 0)
  const busy = useUI((u) => u.busy)
  const { fit, tidy, rf } = useMapActions()
  const file = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const isMap = s.view === 'map'

  const saveFile = () => {
    const g = useGraph.getState().graph
    if (!g.order.length) return
    const data = JSON.stringify({ app: 'concept-transformer', v: 4, saved: new Date().toISOString(), graph: g }, null, 1)
    download('data:application/json;charset=utf-8,' + encodeURIComponent(data), `concept-map-${new Date().toISOString().slice(0, 10)}.json`)
  }
  const openFile = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result))
        const g = readMap(d && d.graph)
        if (!g) throw new Error('not a map')
        if (useGraph.getState().graph.order.length && !window.confirm('Replace the map on screen with the one in this file?')) return
        useGraph.getState().replace(g)
        setTimeout(fit, 80)
      } catch { useUI.getState().toast('That file is not a Concept Transformer map.', 'error') }
    }
    r.readAsText(f)
  }
  const picture = async () => {
    const nodes = rf.getNodes()
    if (!nodes.length) return
    const el = document.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) return
    const b = getNodesBounds(nodes)
    const w = Math.min(4000, b.width + 120), h = Math.min(4000, b.height + 120)
    const vp = getViewportForBounds(b, w, h, 0.2, 2, 0.06)
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    try {
      const url = await toPng(el, { backgroundColor: bg, width: w, height: h, pixelRatio: 2,
        style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } })
      download(url, 'concept-map.png')
    } catch { useUI.getState().toast('The picture could not be made.', 'error') }
  }

  return (
    <>
      {busy
        ? <Button size="sm" variant="destructive" className="h-7" onClick={stopRun} title="Stop after the call in progress (Esc)"><Square />Stop</Button>
        : <Button size="sm" className="h-7" disabled={!toRun} onClick={runAll} title="Run every transform that is new or changed, inputs first (Shift+R)"><Play />Run all{toRun ? ` (${toRun})` : ''}</Button>}
      <Button size="icon" variant="ghost" className="size-7" disabled={!canUndo} onClick={() => useGraph.getState().undo()} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 /></Button>
      <input ref={file} type="file" accept=".json,application/json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = '' }} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-7" aria-label="Menu" title="Menu"><Menu /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={s.view} onValueChange={(v) => s.set({ view: v as 'map' | 'outline' })}>
            <DropdownMenuRadioItem value="map">Graph</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="outline">Outline (as text)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuItem disabled={!isMap} onSelect={fit}>Fit the graph in view<DropdownMenuShortcut>H</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem disabled={!isMap || !count} onSelect={tidy}>Tidy up the layout<DropdownMenuShortcut>L</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuCheckboxItem checked={s.minimap} onCheckedChange={(v) => s.set({ minimap: !!v })}>Overview map</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Map</DropdownMenuLabel>
          <DropdownMenuItem disabled={!count} onSelect={saveFile}>Save map to a file</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => file.current?.click()}>Open a map file</DropdownMenuItem>
          <DropdownMenuItem disabled={!isMap || !count} onSelect={() => void picture()}>Save a picture</DropdownMenuItem>
          <DropdownMenuItem disabled={!count} onSelect={() => setConfirmClear(true)}>Clear the map…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPrivacy(true)}>Privacy</DropdownMenuItem>
          <DropdownMenuItem asChild><a href="https://github.com/MovableObject/concept-transformer" target="_blank" rel="noopener noreferrer">The site's code</a></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the whole map?</AlertDialogTitle>
            <AlertDialogDescription>Every box on the map goes. Undo brings it back; Save map keeps a copy.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { window.speechSynthesis?.cancel(); useGraph.getState().clear() }}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PrivacyDialog open={privacy} onOpenChange={setPrivacy} />
    </>
  )
}
