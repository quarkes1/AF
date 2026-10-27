import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
export default defineConfig({
  testDir: '../tests/e2e', timeout: 30000, workers: 1,
  outputDir: '../build/reports/playwright-results',
  reporter: [['list'], ['html', { outputFolder: resolve('build/reports/playwright'), open: 'never' }]],
})
