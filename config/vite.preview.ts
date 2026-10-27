import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { assetsPlugin, preparedPublicDir } from './assets-plugin'

export default defineConfig({
  root: resolve('src/renderer'), base: './', publicDir: preparedPublicDir,
  plugins: [assetsPlugin(), react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { allow: [resolve('.')] } },
  build: { outDir: resolve('build/compiled/renderer'), emptyOutDir: true },
})
