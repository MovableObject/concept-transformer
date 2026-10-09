import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useGraph } from './store/graph'
import { useUI } from './store/ui'

// Development only: the stores on window, so the map can be driven from the browser console while testing.
if (import.meta.env.DEV) Object.assign(window, { __ct: { useGraph, useUI } })

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
