import { defineConfig } from 'vite'
import { event, totalSeats } from './shared/event.ts'

// {{name}}, {{venue}} etc. in the HTML come from shared/event.ts, so event details live in one place.
const vars: Record<string, unknown> = { ...event, totalSeats }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export default defineConfig({
  plugins: [{ name: 'event-vars', transformIndexHtml: (html) => html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? esc(String(vars[k])) : m)) }],
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin/index.html' } } },
  server: { proxy: { '/api': 'http://localhost:3000', '/admin/api': 'http://localhost:3000', '/health': 'http://localhost:3000' } },
})
