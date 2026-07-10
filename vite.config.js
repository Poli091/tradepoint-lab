import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Fix TDZ issues caused by module-level const renaming in minification
    rollupOptions: {
      output: {
        // Keep module names separate to avoid cross-module TDZ collisions
        manualChunks: {
          'conviction': [
            './src/conviction/grade/index.js',
            './src/conviction/swing/engine.js',
            './src/conviction/decision/engine.js',
          ],
        },
      },
    },
  },
})
