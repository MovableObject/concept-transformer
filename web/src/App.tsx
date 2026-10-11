import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMoves } from '@/lib/api'
import { onCopy, onPaste, onShortcut } from '@/lib/keys'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'
import { Header } from '@/components/Header'
import { SidePanel } from '@/components/SidePanel'
import { Toolbar } from '@/components/Toolbar'
import { NodePanel } from '@/components/NodePanel'
import { MapView } from '@/components/MapView'
import { Outline } from '@/components/Outline'
import { TabMenu } from '@/components/TabMenu'
import { Footer, Toasts } from '@/components/Footer'

export default function App() {
  const view = useSettings((s) => s.view)
  const sidebar = useSettings((s) => s.sidebar)
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
          <div className={cn('grid min-h-0 flex-1 max-md:grid-cols-1', sidebar ? 'grid-cols-[320px_minmax(0,1fr)]' : 'grid-cols-[52px_minmax(0,1fr)]')}>
            <SidePanel />
            <main className="flex min-h-0 flex-col max-md:min-h-[85vh]">
              <Toolbar />
              <NodePanel />
              <div className="min-h-0 flex-1">{view === 'map' ? <MapView /> : <Outline />}</div>
            </main>
          </div>
          <Footer />
        </div>
        <TabMenu />
        <Toasts />
      </ReactFlowProvider>
    </TooltipProvider>
  )
}
