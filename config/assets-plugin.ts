import { resolve } from 'node:path'
import type { Plugin } from 'vite'
// @ts-expect-error Shared build checker is an intentionally plain Node script.
import { projectRoot, checkedResources } from '../scripts/check-assets.mjs'
// @ts-expect-error Shared build staging tool is an intentionally plain Node script.
import { prepareRendererAssets } from '../scripts/prepare-assets.mjs'
import titleReviewAssets from './title-review-assets.json'
import { developmentAssets } from './dev-assets'

export const preparedPublicDir = resolve(projectRoot, 'build/compiled/resources/ui')
export function assetsPlugin(): Plugin {
  let devResources: Array<{file:string;sourcePath:string}> = []
  return {
    name: 'af-checked-local-assets',
    config(_config,environment) {
      if(environment.command==='serve')return {publicDir:false}
    },
    async configResolved(config) {
      const reviewIds=process.env.VITE_TITLE_ART_REVIEW==='1'?titleReviewAssets:[]
      if(config.command==='serve')devResources=await checkedResources(projectRoot,reviewIds)
      else await prepareRendererAssets(projectRoot,preparedPublicDir,reviewIds)
    },
    configureServer(server) {
      server.middlewares.use(developmentAssets(devResources))
    },
    transformIndexHtml(html, context) {
      // Vite's development preamble requires inline scripts; shipped HTML does not.
      return context.server ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html
    },
  }
}
