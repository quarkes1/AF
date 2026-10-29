import {test,expect,_electron as electron} from '@playwright/test'
import {resolve} from 'node:path'
import {mkdir} from 'node:fs/promises'
import {createServer} from 'vite'

async function launch(review=false){
  let server:Awaited<ReturnType<typeof createServer>>|undefined
  if(review){process.env.VITE_SAVE_REVIEW='1';server=await createServer({configFile:resolve('config/vite.preview.ts'),server:{port:0},logLevel:'silent'});await server.listen()}
  const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1',...(server?{ELECTRON_RENDERER_URL:server.resolvedUrls!.local[0]}:{})}})
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>{(window as any).__media=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){(window as any).__media.push(this);return play.call(this)}})
  await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
  return {app,page,errors,close:async()=>{await app.close();await server?.close();delete process.env.VITE_SAVE_REVIEW}}
}

test('home uses empty copy, horizontal blurred background selection and named music choices',async()=>{
  test.setTimeout(120000)
  const {page,errors,close}=await launch()
  try{
    await page.setViewportSize({width:1672,height:941});await mkdir('build/reports/screenshots/home-media',{recursive:true})
    await expect(page.locator('.home__story h2')).toContainText('开始故事');await expect(page.locator('.home__story-note')).toHaveText('与你的日常，\n就是奇迹')
    const bg=page.getByRole('button',{name:'切换背景',exact:true}),music=page.getByRole('button',{name:'切换主页音乐',exact:true})
    await expect(bg).toHaveText('');await expect(music).toHaveText('')
    await bg.click();const picker=page.getByRole('dialog',{name:'选择大厅背景'});await expect(picker).toBeVisible();await expect(page.locator('.home__scene')).toHaveCSS('filter','blur(6px)')
    await expect(picker).toHaveCSS('clip-path',/polygon/)
    await expect(picker.getByRole('button',{name:/^使用背景/})).toHaveCount(15)
    const rail=page.locator('.home-background-options');await rail.hover();await page.mouse.wheel(0,500);await expect.poll(()=>rail.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
    await page.screenshot({path:'build/reports/screenshots/home-media/backgrounds.png'})
    await page.getByRole('button',{name:'使用背景 教室',exact:true}).click();await expect(picker).toBeHidden();await expect(page.locator('.home__background')).toHaveAttribute('src',/classroom-day/)
    await page.mouse.move(800,470);const restingNav=(await page.locator('.home__navigation').boundingBox())!
    await music.click();const songs=page.getByRole('dialog',{name:'选择主页音乐'});await expect(songs).toHaveCSS('opacity','1')
    await expect(songs).toHaveCSS('clip-path',/polygon/)
    await expect.poll(async()=>restingNav.y-(await page.locator('.home__navigation').boundingBox())!.y).toBeGreaterThan(25)
    await page.mouse.move(100,100);await expect.poll(()=>page.getByTestId('home').evaluate(el=>Number(el.style.getPropertyValue('--home-pointer-x')))).toBeLessThan(-.5)
    const rect=(await songs.boundingBox())!,nav=(await page.locator('.home__navigation').boundingBox())!;expect(rect.y).toBeGreaterThanOrEqual(nav.y+nav.height)
    await expect(songs.getByRole('button',{name:'播放 新しい朝の光',exact:true})).toBeVisible();await page.getByRole('button',{name:'播放 君と紡ぐ日々',exact:true}).click();await expect(page.getByRole('button',{name:'播放 君と紡ぐ日々',exact:true})).toHaveAttribute('aria-pressed','true')
    expect(await page.evaluate(()=>(window as any).__media.filter((a:HTMLMediaElement)=>a.src.includes('suno-home-02')).at(-1).loop)).toBe(true)
    await expect(page.locator('.home-music-options .icon')).toHaveCount(0)
    const progress=page.getByRole('slider',{name:'音乐播放进度'})
    await expect(progress).toBeEnabled()
    await progress.fill('30')
    await expect.poll(()=>page.evaluate(()=>(window as any).__media.filter((a:HTMLMediaElement)=>a.src.includes('suno-home-02')).at(-1).currentTime)).toBeGreaterThanOrEqual(29)
    await page.getByRole('button',{name:'暂停主页音乐',exact:true}).click()
    await expect(page.getByRole('button',{name:'播放主页音乐',exact:true})).toBeVisible()
    expect(await page.evaluate(()=>(window as any).__media.filter((a:HTMLMediaElement)=>a.src.includes('suno-home-02')).at(-1).paused)).toBe(true)
    await page.getByRole('button',{name:'播放主页音乐',exact:true}).click()
    await expect(page.getByRole('button',{name:'暂停主页音乐',exact:true})).toBeVisible()
    await page.mouse.move(1500,100)
    await expect.poll(()=>songs.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(-2)
    await page.getByRole('button',{name:'上一首',exact:true}).click()
    await expect(page.getByRole('button',{name:'播放 新しい朝の光',exact:true})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'下一首',exact:true}).click()
    await expect(page.getByRole('button',{name:'播放 君と紡ぐ日々',exact:true})).toHaveAttribute('aria-pressed','true')

    await expect(page.getByRole('button',{name:'播放 君と紡ぐ日々',exact:true})).toHaveCSS('color','rgb(53, 197, 237)');await page.screenshot({path:'build/reports/screenshots/home-media/music.png'})
    await page.keyboard.press('Escape');await expect(songs).toBeHidden();await expect(music).toBeFocused();await expect.poll(()=>page.locator('.home__navigation').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42)).toBe(0)
    await page.setViewportSize({width:800,height:600});await music.click();await expect(songs).toHaveCSS('opacity','1');await expect(page.getByRole('button',{name:'播放 君と紡ぐ日々',exact:true})).toBeInViewport({ratio:1});await page.screenshot({path:'build/reports/screenshots/home-media/compact-music.png'})
    await page.keyboard.press('Escape');await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','');await music.click();await expect(page.getByRole('button',{name:'播放 君と紡ぐ日々',exact:true})).toHaveAttribute('aria-pressed','true')
    expect(errors).toEqual([])
  }finally{await close()}
})

test('home continues the newest archive and updates chapter/last-line after archive changes',async()=>{
  test.setTimeout(120000)
  const {page,errors,close}=await launch(true)
  try{
    await expect(page.locator('.home__story h2')).toContainText('继续故事');await expect(page.locator('.home__story-chapter')).toHaveText('全新的起点');await expect(page.locator('.home__story-note')).toHaveText('与你相遇的每一天，都值得珍藏。')
    await page.locator('.home__story').click();await expect(page.getByRole('heading',{name:'全新的起点',exact:true})).toBeVisible();await expect(page.getByText(/已将首页搭档切换为 Aurore/)).toBeVisible()
    await expect(page.locator('.save-screen__header')).not.toContainText('优先')
    await page.getByRole('button',{name:'选择故事 图书馆的午后'}).click();await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByRole('textbox',{name:'故事名称',exact:true}).fill('新存档名称');await page.getByRole('button',{name:'保存名称',exact:true}).click();await page.getByRole('button',{name:'返回首页',exact:true}).click()
    await expect(page.locator('.home__story-chapter')).toHaveText('图书馆的午后');await expect(page.locator('.home__story-note')).toHaveText('书页翻过的时候，我们的故事仍将...')
    await page.locator('.home__story').click();await expect(page.getByRole('heading',{name:'新存档名称',exact:true})).toBeVisible();await expect(page.getByText(/已将首页搭档切换为 演示搭档/)).toBeVisible()
    await page.getByRole('button',{name:'返回首页',exact:true}).click();await expect(page.getByRole('button',{name:'与 演示搭档 聊聊',exact:true})).toBeVisible()
    await page.screenshot({path:'build/reports/screenshots/home-media/latest-story.png'})
    expect(errors).toEqual([])
  }finally{await close()}
})
