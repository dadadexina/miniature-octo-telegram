import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        cleanupOutdatedCaches: true
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
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
    exclude: ['node_modules', 'dist', 'e2e', 'playwright-report', 'test-results']
  }
})
