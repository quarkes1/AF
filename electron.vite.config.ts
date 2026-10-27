import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { assetsPlugin, preparedPublicDir } from './config/assets-plugin'

export default defineConfig({
  main: { build: { outDir: 'build/compiled/main', rollupOptions: { input: resolve('src/main/app/index.ts') } } },
  preload: { build: { outDir: 'build/compiled/preload', rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
  renderer: {
    root: 'src/renderer', base: './', publicDir: preparedPublicDir,
    plugins: [assetsPlugin(), react()],
    build: { outDir: resolve('build/compiled/renderer'), emptyOutDir: true },
    server: { host: '127.0.0.1' },
  },
})
