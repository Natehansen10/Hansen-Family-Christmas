import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Serves /api/* in `vite dev` with the same handler Vercel runs in production. */
function devApi(): Plugin {
  return {
    name: 'maison-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const { handle } = (await server.ssrLoadModule('/server/app.ts')) as typeof import('./server/app')
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
            // @ts-expect-error node needs this for streamed bodies
            duplex: 'half',
          })
          const response = await handle(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  build: { target: 'es2022' },
  // `vite preview` serves the production bundle; point its API at a running `vite dev` for local checks
  preview: { proxy: { '/api': 'http://localhost:5173' } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
