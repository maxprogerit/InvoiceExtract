/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Dev only: the Vite dev server (a Node process on YOUR machine) proxies /api to the backend and
  // adds the key. Nothing here is bundled into the browser build; in Docker nginx does the same job.
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '..'), '')
  const backend = env.BACKEND_URL ?? 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          headers: env.API_KEY ? { 'X-API-Key': env.API_KEY } : {},
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
