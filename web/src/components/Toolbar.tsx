// Above the map: view switch and map tools.
import { useRef } from 'react'
import { getNodesBounds, getViewportForBounds, useReactFlow } from '@xyflow/react'
import { toPng } from 'html-to-image'
import { Download, FolderOpen, Image as ImageIcon, LayoutGrid, Maximize, Save, Undo2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { normalize, useGraph } from '@/store/graph'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href; a.download = name
  document.body.append(a); a.click(); a.remove()
}

export function Toolbar() {
  const s = useSettings()
  const count = useGraph((g) => g.graph.order.length)
  const rf = useReactFlow()
  const file = useRef<HTMLInputElement>(null)
  const isMap = s.view === 'map'

  const tidy = () => {
    const measured: Record<string, { w: number; h: number }> = {}
    for (const n of rf.getNodes()) if (n.measured?.width) measured[n.id] = { w: n.measured.width, h: n.measured.height ?? 60 }
    useGraph.getState().tidy(measured)
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 }), 80)
  }
  const saveFile = () => {
    const g = useGraph.getState().graph
    if (!g.order.length) return
    const data = JSON.stringify({ app: 'concept-transformer', v: 3, saved: new Date().toISOString(), graph: g }, null, 1)
    download('data:application/json;charset=utf-8,' + encodeURIComponent(data), `concept-map-${new Date().toISOString().slice(0, 10)}.json`)
  }
  const openFile = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result))
        const g = normalize(d && d.graph)
        if (!g) throw new Error('not a map')
        if (useGraph.getState().graph.order.length && !window.confirm('Replace the map on screen with the one in this file?')) return
        useGraph.getState().replace(g)
        setTimeout(() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 }), 80)
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
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      <Tabs value={s.view} onValueChange={(v) => s.set({ view: v as 'map' | 'outline' })}>
        <TabsList className="h-8">
          <TabsTrigger value="map" className="px-3 text-xs">Map</TabsTrigger>
          <TabsTrigger value="outline" className="px-3 text-xs">Outline</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button size="sm" variant="outline" disabled={!isMap} onClick={() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 })}><Maximize />Fit</Button>
      <Button size="sm" variant="outline" disabled={!isMap || !count} onClick={tidy}><LayoutGrid />Tidy up</Button>
      <Button size="sm" variant="outline" disabled={!count} onClick={() => useGraph.getState().undoLastPress()}><Undo2 />Undo last press</Button>
      <Button size="sm" variant="outline" disabled={!count} onClick={saveFile}><Save />Save map</Button>
      <Button size="sm" variant="outline" onClick={() => file.current?.click()}><FolderOpen />Open map</Button>
      <input ref={file} type="file" accept=".json,application/json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = '' }} />
      <Button size="sm" variant="outline" disabled={!isMap || !count} onClick={() => void picture()}><ImageIcon />Picture</Button>
      <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
        <Switch checked={s.showChanges} onCheckedChange={(v) => s.set({ showChanges: v })} /> Show changes
      </label>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button size="sm" variant="ghost" disabled={!count}><Download className="hidden" />Clear</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the whole map?</AlertDialogTitle>
            <AlertDialogDescription>Every box on the map goes. Save the map first if you want to keep it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { window.speechSynthesis?.cancel(); useGraph.getState().clear() }}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
