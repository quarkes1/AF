import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { assetsPlugin, preparedPublicDir } from './config/assets-plugin'

export default defineConfig({
  main: { build: { outDir: 'build/compiled/main', rollupOptions: { external:/^(?:@deepseek-ai\/|@napi-rs\/|tesseract\.js|pdfjs-dist)/,input: {index:resolve('src/main/app/index.ts'),'materials-parser':resolve('src/main/runtime/worker/materials-parser.ts'),'materials-agent':resolve('src/main/runtime/worker/materials-agent.ts'),'character-agent':resolve('src/main/runtime/worker/character-agent.ts'),'experience-agent':resolve('src/main/runtime/worker/experience-agent.ts')} } } },
  preload: { build: { outDir: 'build/compiled/preload', rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
  renderer: {
    root: 'src/renderer', base: './', publicDir: preparedPublicDir,
    plugins: [assetsPlugin(), react()],
    build: { outDir: resolve('build/compiled/renderer'), emptyOutDir: true,rollupOptions:{input:{index:resolve('src/renderer/index.html'),validation:resolve('src/renderer/validation.html')}} },
    server: { host: '127.0.0.1' },
  },
})
