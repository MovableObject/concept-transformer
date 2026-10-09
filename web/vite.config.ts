import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'

// Concept Transformer, version 3. `npm run dev` serves the page on :5180 and passes the relay and the move list
// through to the local PHP server (tests/local/serve.ps1 on :8787), so the real relay answers during development.
// `npm run build` writes dist/, which tools/deploy.py uploads next to relay.php on the live site.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5180,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/relay.php': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/moves.json': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/fonts': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
})
