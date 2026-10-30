import {test,expect,_electron as electron} from '@playwright/test'
import {createServer,type ViteDevServer} from 'vite'
import {resolve} from 'node:path'
import {mkdir} from 'node:fs/promises'

test('archives remain global, enter restores the owning companion and rename updates chronological order',async()=>{
  test.setTimeout(120000)
  const {page,errors,close}=await launch(true)
  try{
    await page.locator('.home__save').click();await page.getByRole('button',{name:'选择故事 图书馆的午后'}).click()
    await page.getByRole('button',{name:'返回首页'}).click();await expect(page.getByRole('button',{name:'与 Aurore 聊聊'})).toBeVisible()
    await page.locator('.home__save').click();await page.getByRole('button',{name:'继续故事',exact:true}).click();await expect(page.getByText(/已将首页搭档切换为 演示搭档/)).toBeVisible()
    await page.getByRole('button',{name:'返回首页'}).click();await expect(page.getByRole('button',{name:'与 演示搭档 聊聊'})).toBeVisible();await expect(page.locator('.home__portrait img')).toHaveAttribute('src',/02-smile/)
    await page.getByRole('button',{name:/^搭档档案/}).click();await page.getByRole('button',{name:'查看 演示搭档 档案'}).click();await expect(page.getByRole('button',{name:'已选中',exact:true})).toBeVisible();await page.getByRole('button',{name:'返回搭档库'}).click();await page.getByRole('button',{name:'返回首页'}).click()
    await page.locator('.home__save').click();await expect(page.getByRole('button',{name:/^选择故事/})).toHaveCount(6)
    await page.getByRole('button',{name:'选择故事 尚未读完的信'}).click();await expect(page.getByRole('button',{name:'继续故事',exact:true})).toBeDisabled()
    await page.getByRole('button',{name:'返回首页'}).click();await expect(page.getByRole('button',{name:'与 演示搭档 聊聊'})).toBeVisible()
    await page.locator('.home__save').click();await page.getByRole('button',{name:'下一页'}).click();await page.getByRole('button',{name:'选择故事 窗边的留白'}).click();await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByRole('textbox',{name:'故事名称',exact:true}).fill('较早存档的新名字');await page.getByRole('button',{name:'保存名称'}).click()
    await expect(page.getByRole('button',{name:/^选择故事/}).first()).toHaveAttribute('aria-label','选择故事 较早存档的新名字')
    await expect(page.getByRole('button',{name:'上一页'})).toBeDisabled();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('button',{name:'返回首页'}).click();await expect(page.getByRole('button',{name:'与 Aurore 聊聊'})).toBeVisible()
    expect(errors).toEqual([])
  }finally{await close()}
})

async function launch(review=false){
  const old=process.env.VITE_SAVE_REVIEW
  let server:ViteDevServer|undefined
  if(review){
    process.env.VITE_SAVE_REVIEW='1'
    server=await createServer({configFile:resolve('config/vite.preview.ts'),server:{port:0,strictPort:false},logLevel:'silent'})
    await server.listen()
  }
  const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1',...(server?{ELECTRON_RENDERER_URL:server.resolvedUrls!.local[0]}:{})}})
  const page=await app.firstWindow(),errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{
    const sources:string[]=[]
    Object.defineProperty(window,'__saveAudioCalls',{value:sources})
    const play=HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play=function(){sources.push(this.src);return play.call(this)}
  })
  await page.evaluate(()=>localStorage.setItem('af.frontend-preview.preferences.v1',JSON.stringify({muted:true,reducedMotion:false})))
  await page.reload();await page.keyboard.press('Escape')
  await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x')
  await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
  return {page,errors,close:async()=>{await app.close();await server?.close();if(old===undefined)delete process.env.VITE_SAVE_REVIEW;else process.env.VITE_SAVE_REVIEW=old}}
}

test('empty saves page preserves home draft, cancels real creation without a save and keeps BGM instance',async()=>{
  test.setTimeout(60000)
  const {page,errors,close}=await launch()
  try{
    await page.getByRole('button',{name:'与 Aurore 聊聊'}).click()
    await page.getByRole('textbox',{name:'想和 Aurore 说些什么？'}).fill('这份草稿需要保留。')
    await page.locator('.home__save').click()
    await expect(page.getByRole('region',{name:'存档管理'})).toBeVisible()
    await expect(page.getByRole('heading',{name:'还没有故事存档'})).toBeVisible()
    await expect(page.getByRole('button',{name:'继续故事'})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'上一页'})).toBeDisabled()
    await expect(page.getByRole('button',{name:'下一页'})).toBeDisabled()
    await page.getByRole('tab',{name:'保存点',exact:true}).click()
    await expect(page.getByText('请先选择一个故事，再查看它的保存点。')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('.save-card--create').click()
    const creation=page.getByRole('dialog',{name:'新建故事'})
    await expect(creation).toBeVisible();await expect(creation.getByRole('textbox',{name:'故事名称',exact:true})).toHaveValue('全新的起点')
    await page.keyboard.press('Escape')
    await expect(creation).not.toBeVisible();await expect(page.getByRole('heading',{name:'还没有故事存档'})).toBeVisible()
    await mkdir('build/reports/screenshots/saves',{recursive:true})
    await page.screenshot({path:'build/reports/screenshots/saves/empty.png',animations:'disabled'})
    await page.getByRole('button',{name:'返回首页'}).click()
    await expect(page.getByTestId('save-screen')).toBeHidden();await expect(page.locator('.home__save')).toBeFocused()
    await page.getByRole('button',{name:'与 Aurore 聊聊'}).click()
    await expect(page.getByRole('textbox',{name:'想和 Aurore 说些什么？'})).toHaveValue('这份草稿需要保留。')
    const sources=await page.evaluate(()=>(window as unknown as {__saveAudioCalls:string[]}).__saveAudioCalls)
    expect(sources.filter(s=>s.includes('suno-home-01'))).toHaveLength(1)
    expect(errors).toEqual([])
  }finally{await close()}
})

test('review saves select without activation, paginate, separate checkpoints and block damaged records',async()=>{
  test.setTimeout(90000)
  const {page,errors,close}=await launch(true)
  try{
    await page.locator('.home__save').click()
    await expect(page.getByText('演示存档 · 仅本次界面预览，不写入磁盘')).toBeVisible()
    await expect(page.getByRole('heading',{name:'全新的起点',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'选择故事 图书馆的午后',exact:true}).click()
    await expect(page.getByRole('heading',{name:'图书馆的午后'})).toBeVisible()
    await expect(page.getByTestId('save-screen')).toBeVisible()
    await page.getByRole('button',{name:'选择故事 尚未读完的信'}).click()
    await expect(page.getByRole('button',{name:'继续故事',exact:true})).toBeDisabled()
    await expect(page.getByText('存档损坏，需通过备份恢复。')).toBeVisible()
    await page.getByRole('button',{name:'选择故事 旧日书页'}).click()
    await expect(page.getByRole('button',{name:'继续故事',exact:true})).toBeDisabled()
    await page.getByRole('button',{name:'选择故事 走廊里的约定'}).click()
    await expect(page.getByRole('button',{name:'继续故事',exact:true})).toBeEnabled()
    await expect(page.getByText('部分来源文件缺失，已有演出仍可恢复。')).toBeVisible()
    await page.getByRole('button',{name:'下一页'}).click()
    await expect(page.getByRole('heading',{name:'窗边的留白'})).toBeVisible()
    await page.getByRole('tab',{name:'故事存档',exact:true}).click()
    await expect(page.getByRole('button',{name:'选择故事 窗边的留白'})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('tab',{name:'故事存档',exact:true}).press('ArrowRight')
    await expect(page.getByRole('tab',{name:'保存点',exact:true})).toBeFocused()
    await page.getByRole('tab',{name:'保存点',exact:true}).click()
    await page.getByRole('tab',{name:'保存点',exact:true}).press('ArrowLeft')
    await expect(page.getByRole('button',{name:'选择故事 窗边的留白'})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'返回首页'}).click();await expect(page.getByTestId('save-screen')).toBeHidden()
    await page.locator('.home__save').click()
    await expect(page.getByRole('heading',{name:'窗边的留白'})).toBeVisible()
    await page.getByRole('button',{name:'上一页'}).click()
    await page.getByRole('button',{name:'查看保存点',exact:true}).click()
    await expect(page.getByRole('heading',{name:'全新的起点 · 保存点'})).toBeVisible()
    await expect(page.getByRole('button',{name:'选择保存点 图书馆门口'})).toBeVisible()
    await page.getByRole('button',{name:'自动',exact:true}).click()
    await expect(page.getByRole('button',{name:'选择保存点 片段结束'})).toBeVisible()
    await expect(page.getByRole('button',{name:'选择保存点 图书馆门口'})).toHaveCount(0)
    await page.getByRole('button',{name:'快速',exact:true}).click()
    await page.getByRole('button',{name:'选择保存点 临时停留'}).click()
    await expect(page.getByRole('button',{name:'读取此处',exact:true})).toBeDisabled()
    await page.getByRole('button',{name:'返回故事存档'}).click()
    await mkdir('build/reports/screenshots/saves',{recursive:true})
    await page.screenshot({path:'build/reports/screenshots/saves/stories.png',animations:'disabled'})
    await page.setViewportSize({width:800,height:600})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:'build/reports/screenshots/saves/narrow.png',animations:'disabled'})
    expect(errors).toEqual([])
  }finally{await close()}
})

test('review rename and delete require valid input, cancel restores focus and changes remain preview-only',async()=>{
  test.setTimeout(60000)
  const {page,errors,close}=await launch(true)
  try{
    await page.locator('.home__save').click()
    await page.getByRole('button',{name:'重命名',exact:true}).click()
    const input=page.getByRole('textbox',{name:'故事名称',exact:true})
    await expect(input).toBeFocused();await input.fill('   ')
    await page.getByRole('button',{name:'保存名称'}).click()
    await expect(page.getByRole('alert')).toHaveText('请输入故事名称。')
    await input.fill('新的书页');await page.getByRole('button',{name:'保存名称'}).click()
    await expect(page.getByRole('heading',{name:'新的书页'})).toBeVisible()
    await expect(page.getByRole('button',{name:'重命名',exact:true})).toBeFocused()
    await page.getByRole('button',{name:'重命名',exact:true}).click();await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByLabel('管理所选故事').click();await page.getByRole('button',{name:'删除故事',exact:true}).click()
    await page.getByRole('textbox',{name:'确认故事名称'}).fill('不匹配')
    await page.getByRole('button',{name:'确认删除'}).click()
    await expect(page.getByRole('alert')).toHaveText('请输入完整故事名称以确认。')
    await page.getByRole('textbox',{name:'确认故事名称'}).fill('新的书页')
    await page.getByRole('button',{name:'确认删除'}).click()
    await expect(page.getByRole('button',{name:'选择故事 新的书页'})).toHaveCount(0)
    await expect(page.getByText('已更新本次演示，未写入磁盘。')).toBeVisible()
    await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible()
    await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    await page.locator('.home__save').click();await expect(page.getByRole('heading',{name:'全新的起点',exact:true})).toBeVisible()
    expect(errors).toEqual([])
  }finally{await close()}
})
