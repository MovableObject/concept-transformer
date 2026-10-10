import { StrictMode } from 'react'
import { LucideProvider } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useGraph } from './store/graph'
import { useUI } from './store/ui'

// Development only: the stores on window, so the map can be driven from the browser console while testing.
if (import.meta.env.DEV) Object.assign(window, { __ct: { useGraph, useUI } })

// Every icon on the site is drawn at line weight 1.5 (owner, 2026-10-10); the move symbols use the same weight.
createRoot(document.getElementById('root')!).render(<StrictMode><LucideProvider strokeWidth={1.5}><App /></LucideProvider></StrictMode>)
