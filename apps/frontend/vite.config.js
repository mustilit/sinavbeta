import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { visualizer } from 'rollup-plugin-visualizer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Windows'ta localhost → IPv6 (::1) farklı process'e gidebiliyor; IPv4 sabitle
const backendTarget = 'http://127.0.0.1:3000'
const srcPath = path.resolve(__dirname, 'src')

export default defineConfig({
  plugins: [
    react(),
    // ANALYZE=1 npm run build → dist/stats.html üretir, CI artifact'ı olarak yüklenebilir
    process.env.ANALYZE === '1' && visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Sadece proje testlerini topla (node_modules testleri çalışmamalı)
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    // Coverage disiplini — KALITE-DEGERLENDIRME §11
    //   npm run test:coverage ile çalıştır; CI artifact olarak lcov.info upload edilir.
    //   Threshold'lar şimdilik düşük tutuldu; yeni testler eklendikçe +%5/sprint.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/**/*.{test,spec}.{js,jsx}',
        'src/test/**',
        'src/main.jsx',
        'src/**/*.config.{js,cjs}',
        'src/components/ui/**', // shadcn primitives — upstream test'leri yeterli
        'src/pages.config.js',
      ],
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 30,
        lines: 30,
        // TODO: src/api/dalClient.js için %90 threshold ekle (önce baseline test yaz)
        // TODO: src/pages/** için %50 threshold (kademeli)
        // TODO: src/lib/** için %70 threshold
      },
    },
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${srcPath}/$1` },
    ],
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 5174,
    proxy: {
      '/auth': { target: backendTarget, changeOrigin: true },
      '/marketplace': { target: backendTarget, changeOrigin: true },
      '/tests': { target: backendTarget, changeOrigin: true },
      '/site': { target: backendTarget, changeOrigin: true },
      '/me': { target: backendTarget, changeOrigin: true },
      '/admin': { target: backendTarget, changeOrigin: true },
      '/educators': { target: backendTarget, changeOrigin: true },
      '/home': { target: backendTarget, changeOrigin: true },
      '/follows': { target: backendTarget, changeOrigin: true },
      '/objections': { target: backendTarget, changeOrigin: true },
      '/purchases': { target: backendTarget, changeOrigin: true },
      '/attempts': { target: backendTarget, changeOrigin: true },
      '/refunds': { target: backendTarget, changeOrigin: true },
      '/ad-packages': { target: backendTarget, changeOrigin: true },
      '/notifications': { target: backendTarget, changeOrigin: true },
      '/upload': { target: backendTarget, changeOrigin: true },
      '/packages': { target: backendTarget, changeOrigin: true },
      '/docs': { target: backendTarget, changeOrigin: true },
      '/health': { target: backendTarget, changeOrigin: true },
      '/live-sessions': { target: backendTarget, changeOrigin: true },
    },
  },
});