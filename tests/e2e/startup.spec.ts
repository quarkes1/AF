import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

async function launch(options: { muted?: boolean; reduced?: boolean; failAudio?: boolean; failImage?: boolean; failNight?: boolean; seed?: number } = {}) {
  const app = await electron.launch({ args: [resolve('build/compiled/main/index.js')], env: { ...process.env, AF_TEST_MODE: '1' } })
  const page = await app.firstWindow()
  const errors: string[] = [];page.on('pageerror', e=>errors.push(e.message))
  await page.evaluate(({muted,reduced,seed}) => {
    localStorage.setItem('af.frontend-preview.preferences.v1',JSON.stringify({muted:!!muted,reducedMotion:!!reduced}))
    if(seed !== undefined) localStorage.setItem('af.test.seed',String(seed))
  }, options)
  // Add the inspection before reload; production code has no test-only controls.
  await page.addInitScript(({seed}) => {
    if (seed !== undefined) Math.random=()=>seed
    const plays: Array<{src:string;muted:boolean;volume:number}> = []
    const elements: HTMLMediaElement[] = []
    Object.defineProperty(window,'__afAudioCalls',{value:plays})
    Object.defineProperty(window,'__afMediaElements',{value:elements})
    const play=HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play=function(){elements.push(this);plays.push({src:this.src,muted:this.muted,volume:this.volume});return play.call(this)}
  }, options)
  if(options.failAudio)await page.route('**/*.mp3',route=>route.abort())
  if(options.failImage)await page.route('**/library-hall-day.png',route=>route.abort())
  if(options.failNight){
    await page.route('**/auditorium-night.png',route=>route.abort())
    await page.addInitScript(()=>{
      const Current=Date,epoch=new Current(2026,9,27,12,0).valueOf()
      window.Date=new Proxy(Current,{construct(target,args){return Reflect.construct(target,args.length?args:[epoch])}})
    })
  }
  await page.reload()
  return {app,page,errors}
}

test('real Electron loads the approved assets, plays exactly one selected brand and enters home', async()=>{
  const {app,page,errors}=await launch({seed:.1})
  try {
    await expect(page.getByTestId('splash')).toHaveAttribute('data-phase','logo')
    await expect(page.getByTestId('splash')).toHaveCSS('background-color','rgb(0, 0, 0)')
    await expect(page.locator('.splash__logo')).toHaveAttribute('src',/aurora-forge-logo-inverse\.svg$/)
    await expect(page.locator('.splash__identity')).toHaveCSS('animation-duration','0.7s')
    await page.waitForTimeout(450)
    await mkdir('build/reports/screenshots',{recursive:true})
    await page.screenshot({path:'build/reports/screenshots/01-splash.png'})
    await expect(page.getByTestId('title-screen')).toBeVisible()
    await expect(page.getByTestId('title-screen')).toHaveAttribute('aria-label','Aurora Forge 标题栏')
    await expect(page.locator('.title-screen__identity h1')).toHaveCount(0)
    const logo = await page.locator('.title-screen__identity').boundingBox()
    expect(logo!.x).toBeLessThan(1440 * .12)
    expect(logo!.y).toBeLessThan(900 * .15)
    await expect(page.getByTestId('home')).toHaveCount(0)
    await expect(page.getByText('在互动中自然学习')).toHaveCount(0)
    await page.screenshot({path:'build/reports/screenshots/02-title-screen.png',animations:'disabled'})
    await page.keyboard.press('x')
    await expect(page.locator('.title-screen--entering')).toHaveCSS('animation-duration','1s')
    await expect(page.getByTestId('home')).toHaveCSS('animation-duration','2s')
    await expect(page.getByTestId('home')).toHaveAttribute('inert','')
    await expect(page.getByTestId('title-screen')).toHaveCount(0)
    await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    await expect(page.getByTestId('home')).toBeVisible()
    await expect(page.getByRole('button',{name:/开始故事/})).toBeVisible()
    const calls=await page.evaluate(()=> (window as unknown as {__afAudioCalls:Array<{src:string}>}).__afAudioCalls)
    expect(calls.filter(c=>c.src.includes('aurora-forge-'))).toHaveLength(1)
    expect(calls[0].src).toContain('aurora-forge-01.mp3')
    expect(calls.filter(c=>c.src.includes('suno-home-01'))).toHaveLength(1)
    expect(calls.filter(c=>c.src.includes('ui-confirm.ogg'))).toHaveLength(1)
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {__afMediaElements:HTMLMediaElement[]}).__afMediaElements.find(a=>a.src.includes('ui-confirm.ogg'))?.ended)).toBe(true)
    await page.screenshot({path:'build/reports/screenshots/02-home-1440.png',animations:'disabled'})
    expect(errors).toEqual([])
    expect(await page.locator('img').evaluateAll(images=>images.every(i=>(i as HTMLImageElement).naturalWidth>0))).toBe(true)
    for(const [width,height] of [[1100,700],[1280,720],[1920,1080]]){
      await page.setViewportSize({width,height})
      await page.screenshot({path:`build/reports/screenshots/home-${width}.png`,animations:'disabled'})
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    }
  } finally {await app.close()}
})

test('title click plays confirmation once and all five short OGG cues decode and finish',async()=>{
  const {app,page,errors}=await launch({seed:.1})
  try {
    await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
    await page.getByRole('button',{name:'进入首页'}).click()
    await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    const calls=await page.evaluate(()=>(window as unknown as {__afAudioCalls:Array<{src:string}>}).__afAudioCalls)
    expect(calls.filter(c=>c.src.includes('ui-confirm.ogg'))).toHaveLength(1)
    expect(calls.filter(c=>c.src.includes('suno-home-01'))).toHaveLength(1)
    const results=await page.evaluate(async()=>{
      const results:Array<{file:string;duration:number;playedTo:number}>=[]
      for(const file of ['ui-press.ogg','ui-confirm.ogg','ui-back.ogg','dialogue-reveal.ogg','dialogue-advance.ogg']){
        const audio=new Audio(new URL(`assets/audio/sfx/${file}`,document.baseURI).href)
        audio.volume=0
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>{audio.pause();reject(new Error(`Short cue timed out: ${file}`))},5000)
          audio.onended=()=>{clearTimeout(timer);resolve()}
          audio.onerror=()=>{clearTimeout(timer);reject(new Error(`Short cue failed: ${file}`))}
          void audio.play().catch(error=>{clearTimeout(timer);reject(error)})
        })
        results.push({file,duration:audio.duration,playedTo:audio.currentTime})
        audio.removeAttribute('src');audio.load()
      }
      return results
    })
    for(const result of results){expect(result.duration).toBeGreaterThan(.05);expect(result.duration).toBeLessThan(.3);expect(result.playedTo).toBeCloseTo(result.duration,2)}
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('skip is repeat-safe, cancels speech, and hands focus and media to home once',async()=>{
  const {app,page,errors}=await launch({seed:.8})
  try {
    await expect(page.getByTestId('splash')).toHaveAttribute('data-phase','logo')
    await page.keyboard.down('Space')
    await expect(page.getByTestId('title-screen')).toBeVisible()
    await expect(page.getByTestId('home')).toHaveCount(0)
    await page.keyboard.up('Space');await page.keyboard.press('Space')
    await expect(page.getByTestId('home')).toBeVisible()
    // The confirmation may overlap the continuing BGM, but brand speech must be stopped.
    const playing=await page.evaluate(()=> (window as unknown as {__afMediaElements:HTMLMediaElement[]}).__afMediaElements.filter(a=>!a.paused&&!a.src.includes('/sfx/')).length)
    expect(playing).toBeLessThanOrEqual(1)
    const calls=await page.evaluate(()=> (window as unknown as {__afAudioCalls:Array<{src:string}>}).__afAudioCalls)
    expect(calls.filter(c=>c.src.includes('aurora-forge-02'))).toHaveLength(1)
    expect(calls.filter(c=>c.src.includes('suno-home-01'))).toHaveLength(1)
    expect(calls.filter(c=>c.src.includes('ui-confirm.ogg'))).toHaveLength(1)
    expect(errors).toEqual([])
  } finally {await app.close()}
})

test('saved mute survives startup; reduced motion and unavailable audio never block home',async()=>{
  const {app,page,errors}=await launch({muted:true,reduced:true,failAudio:true})
  try {
    await expect(page.getByRole('button',{name:'开启声音'})).toBeVisible()
    await expect(page.locator('.app')).toHaveAttribute('data-motion','reduced')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('title-screen')).toBeVisible()
    await page.keyboard.press('q')
    await expect(page.getByTestId('home')).toBeVisible()
    const calls=await page.evaluate(()=> (window as unknown as {__afAudioCalls:Array<{src:string;muted:boolean}>}).__afAudioCalls)
    expect(calls.filter(c=>c.src.includes('aurora-forge-'))).toHaveLength(0)
    expect(calls.every(c=>c.muted)).toBe(true)
    expect(errors).toEqual([])
  } finally {await app.close()}
})

test('missing background gives a readable fallback instead of a blank or blocked app',async()=>{
  const {app,page,errors}=await launch({failImage:true,failAudio:true})
  try {
    await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
    await page.keyboard.press('ArrowRight');await expect(page.getByTestId('home')).toBeVisible()
    await expect(page.getByRole('button',{name:/开始故事/})).toBeVisible()
    await expect(page.getByText('部分素材暂不可用，仍可继续。')).toBeVisible()
    expect(errors).toEqual([])
  } finally {await app.close()}
})

test('home parallax is bounded, hover scales without layout changes, and pointer leave returns to rest',async()=>{
  const {app,page,errors}=await launch({muted:true})
  try {
    await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
    await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    const portrait=page.locator('.home__portrait'),nav=page.locator('.home__navigation'),story=page.locator('.home__story')
    const layout=await story.evaluate(e=>({width:(e as HTMLElement).offsetWidth,height:(e as HTMLElement).offsetHeight,left:(e as HTMLElement).offsetLeft,top:(e as HTMLElement).offsetTop}))
    await page.mouse.move(1430,890)
    await expect.poll(async()=>portrait.evaluate(e=>parseFloat(getComputedStyle(e).translate))).toBeGreaterThan(9)
    const motion=await portrait.evaluate(e=>getComputedStyle(e).translate.split(' ').map(parseFloat))
    expect(motion[0]).toBeLessThanOrEqual(10);expect(motion[1]).toBeLessThanOrEqual(6)
    await expect.poll(async()=>nav.evaluate(e=>parseFloat(getComputedStyle(e).translate))).toBeLessThan(-4)
    await story.hover()
    await expect(story).toHaveCSS('transform','matrix(1.02, 0, 0, 1.02, 0, 0)')
    expect(await story.evaluate(e=>({width:(e as HTMLElement).offsetWidth,height:(e as HTMLElement).offsetHeight,left:(e as HTMLElement).offsetLeft,top:(e as HTMLElement).offsetTop}))).toEqual(layout)
    await page.mouse.move(-10,-10)
    await expect.poll(async()=>portrait.evaluate(e=>Math.abs(parseFloat(getComputedStyle(e).translate)))).toBeLessThan(.01)
    await expect(story).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)')
    await page.emulateMedia({reducedMotion:'reduce'})
    await story.hover()
    await expect(portrait).toHaveCSS('translate','none');await expect(story).toHaveCSS('transform','none')
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('saved reduced motion suppresses home parallax and hover scaling',async()=>{
  const {app,page,errors}=await launch({muted:true,reduced:true})
  try {
    await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
    await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    await page.mouse.move(1400,850);await page.locator('.home__story').hover()
    await expect(page.locator('.home__portrait')).toHaveCSS('translate','none')
    await expect(page.locator('.home__navigation')).toHaveCSS('translate','none')
    await expect(page.locator('.home__story')).toHaveCSS('transform','none')
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test.describe('title scene review',()=>{
  test.skip(process.env.AF_TITLE_ART_TEST!=='1','Run against the explicit title-art review build.')
  test('local-clock variants retain BGM and keep cupola windows outside the light layer',async()=>{
    const {app,page,errors}=await launch({muted:true})
    try {
      await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
      const setHour=async(hour:number)=>page.evaluate(hour=>{
        const Current=Date
        const epoch=new Current(2026,9,27,hour,0).valueOf()
        window.Date=new Proxy(Current,{construct(target,args){return Reflect.construct(target,args.length?args:[epoch])}})
        window.dispatchEvent(new Event('focus'))
      },hour)
      await mkdir('build/reports/screenshots/title-scene',{recursive:true})
      for(const [hour,period] of [[12,'day'],[18,'dusk'],[21,'night']] as const){
        await setHour(hour)
        await expect(page.getByTestId('title-scene')).toHaveAttribute('data-period',period)
        await page.locator('.title-scene__frame--previous').waitFor({state:'detached'})
        await page.screenshot({path:`build/reports/screenshots/title-scene/${period}.png`,animations:'disabled'})
      }
      const mask=page.locator('.title-scene__frame:not(.title-scene__frame--previous) mask[id$="-windows"] rect')
      expect(await mask.evaluateAll(rects=>rects.every(rect=>Number(rect.getAttribute('y'))>=330))).toBe(true)
      await page.evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,value:false})
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(page.locator('[data-layer="foliage"]')).toHaveCount(1)
      await expect(page.locator('[data-layer="clouds"]')).toHaveCount(1)
      await expect(page.locator('[data-layer="water"]')).toHaveCount(1)
      await page.locator('.title-scene__frame').evaluate((e:SVGSVGElement)=>{e.pauseAnimations();e.setCurrentTime(8)})
      await page.screenshot({path:'build/reports/screenshots/title-scene/night-layers.png',animations:'disabled'})
      for(const time of [0,3]){
        await page.locator('.title-scene__frame').evaluate((e:SVGSVGElement,time)=>e.setCurrentTime(time),time)
        await page.screenshot({path:`build/reports/screenshots/title-scene/night-motion-${time}.png`,animations:'disabled'})
      }
      await page.emulateMedia({reducedMotion:'reduce'})
      await expect(page.locator('[data-layer="foliage"]')).toHaveCount(0)
      await expect(page.locator('[data-layer="clouds"]')).toHaveCount(0)
      const calls=await page.evaluate(()=>(window as unknown as {__afAudioCalls:Array<{src:string}>}).__afAudioCalls)
      expect(calls.filter(c=>c.src.includes('suno-home-01'))).toHaveLength(1)
      expect(errors).toEqual([])
    }finally{await app.close()}
  })
  test('missing a requested time-of-day image retains a usable title scene',async()=>{
    const {app,page,errors}=await launch({muted:true,failNight:true})
    try {
      await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
      await page.evaluate(()=>{
        const Current=Date,epoch=new Current(2026,9,27,21,0).valueOf()
        window.Date=new Proxy(Current,{construct(target,args){return Reflect.construct(target,args.length?args:[epoch])}})
        window.dispatchEvent(new Event('focus'))
      })
      await expect(page.getByTestId('title-scene')).toHaveAttribute('data-requested-period','night')
      await expect(page.getByTestId('title-scene')).toHaveAttribute('data-period','day')
      await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
      expect(errors).toEqual([])
    }finally{await app.close()}
  })
})
