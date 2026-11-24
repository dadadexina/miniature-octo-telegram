import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createRouteApiMiddleware } from './api/route.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'route-api',
      configureServer(server) {
        server.middlewares.use(createRouteApiMiddleware())
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        importScripts: ['push-handler.js']
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.monkeycode-ai.online']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  test: {
    exclude: ['**/node_modules', 'dist', 'e2e', 'playwright-report', 'test-results', 'mobile']
  }
})
