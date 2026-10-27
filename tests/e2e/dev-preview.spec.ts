import { test, expect, _electron as electron } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { resolve } from 'node:path'

for(const period of ['day','dusk','night'])test(`development title preview loads assets on ${period} startup`,async()=>{
  const originalReview=process.env.VITE_TITLE_ART_REVIEW, originalPeriod=process.env.VITE_TITLE_PERIOD
  let server:ViteDevServer|undefined
  let app:Awaited<ReturnType<typeof electron.launch>>|undefined
  try {
    process.env.VITE_TITLE_ART_REVIEW='1';process.env.VITE_TITLE_PERIOD=period
    server=await createServer({configFile:resolve('config/vite.preview.ts'),server:{port:0,strictPort:false},logLevel:'silent'})
    await server.listen()
    const url=server.resolvedUrls!.local[0]
    app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1',ELECTRON_RENDERER_URL:url}})
    const page=await app.firstWindow()
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
    await page.evaluate(()=>localStorage.setItem('af.frontend-preview.preferences.v1',JSON.stringify({muted:true,reducedMotion:false})))
    await page.reload()
    await expect(page.getByTestId('title-scene')).toHaveAttribute('data-period',period)
    expect(await page.locator('.title-screen__identity img').evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBeGreaterThan(0)
    const source=await page.locator('[data-layer="architecture"] image').getAttribute('href')
    const image=await page.request.get(source!)
    expect(image.headers()['content-type']).toContain('image/png')
    await page.keyboard.press('x')
    await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    expect(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0))).toBe(true)
    expect(errors).toEqual([])
  }finally{
    await app?.close();await server?.close()
    if(originalReview===undefined)delete process.env.VITE_TITLE_ART_REVIEW;else process.env.VITE_TITLE_ART_REVIEW=originalReview
    if(originalPeriod===undefined)delete process.env.VITE_TITLE_PERIOD;else process.env.VITE_TITLE_PERIOD=originalPeriod
  }
})
