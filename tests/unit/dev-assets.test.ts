import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { resolve } from 'node:path'
import { assetsPlugin } from '../../config/assets-plugin'
import { preparedPublicDir } from '../../config/assets-plugin'
// @ts-expect-error Plain Node build helper.
import { prepareRendererAssets } from '../../scripts/prepare-assets.mjs'

describe('development asset requests remain independent of build staging',()=>{
  let server:ViteDevServer
  let base:string
  beforeAll(async()=>{
    server=await createServer({configFile:false,root:resolve('src/renderer'),publicDir:false,plugins:[assetsPlugin()],server:{host:'127.0.0.1',port:0},logLevel:'silent'})
    await server.listen();base=server.resolvedUrls!.local[0]
  })
  afterAll(async()=>{await server?.close()})
  it('serves SVG, PNG and CSS as actual assets, not the HTML fallback',async()=>{
    for(const [file,mime] of [['brand/aurora-forge-logo-inverse.svg','image/svg+xml'],['backgrounds/sipailou-auditorium-day.png','image/png'],['fonts/fonts.css','text/css']]){
      const response=await fetch(new URL('assets/'+file,base))
      expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain(mime)
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100)
    }
  })
  it('keeps returning valid resources after repeated server restart',async()=>{
    for(let i=0;i<2;i++){
      await server.restart();base=server.resolvedUrls!.local[0]
      const response=await fetch(new URL('assets/brand/aurora-forge-logo-inverse.svg',base))
      expect(response.headers.get('content-type')).toContain('image/svg+xml')
      expect(await response.text()).toContain('<svg')
    }
  })
  it('survives a concurrent rebuild of the generated public staging directory',async()=>{
    await prepareRendererAssets(process.cwd(),preparedPublicDir)
    const response=await fetch(new URL('assets/characters/aurore/sprites/01-neutral.png',base))
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('image/png')
  })
  it('supports audio byte ranges and rejects unregistered resources without returning HTML',async()=>{
    const partial=await fetch(new URL('assets/audio/brand/aurora-forge-01.mp3',base),{headers:{Range:'bytes=0-31'}})
    expect(partial.status).toBe(206);expect((await partial.arrayBuffer()).byteLength).toBe(32)
    const missing=await fetch(new URL('assets/not-registered.png',base))
    expect(missing.status).toBe(404);expect(missing.headers.get('content-type')).not.toContain('text/html')
  })
})
