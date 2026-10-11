import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMoves } from '@/lib/api'
import { onCopy, onPaste, onShortcut } from '@/lib/keys'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'
import { Header } from '@/components/Header'
import { SidePanel } from '@/components/SidePanel'
import { NodePanel } from '@/components/NodePanel'
import { MapView } from '@/components/MapView'
import { Outline } from '@/components/Outline'
import { TabMenu } from '@/components/TabMenu'
import { Toasts } from '@/components/Footer'

export default function App() {
  const view = useSettings((s) => s.view)
  const sidebar = useSettings((s) => s.sidebar)
  const params = useSettings((s) => s.params)
  useEffect(() => { void useMoves.getState().load() }, [])
  useEffect(() => {
    window.addEventListener('keydown', onShortcut)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onShortcut)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
  return (
    <TooltipProvider delayDuration={400}>
      <ReactFlowProvider>
        <div className="flex h-full flex-col max-md:h-auto">
          <Header />
          <div className="grid min-h-0 flex-1 max-md:!grid-cols-1"
            style={{ gridTemplateColumns: `${sidebar ? '320px' : '52px'} minmax(0,1fr) ${params ? '340px' : '44px'}` }}>
            <SidePanel />
            <main className="flex min-h-0 flex-col max-md:min-h-[85vh]">
              <div className="min-h-0 flex-1">{view === 'map' ? <MapView /> : <Outline />}</div>
            </main>
            <NodePanel />
          </div>
        </div>
        <TabMenu />
        <Toasts />
      </ReactFlowProvider>
    </TooltipProvider>
  )
}
