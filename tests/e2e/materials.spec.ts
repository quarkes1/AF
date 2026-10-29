import {test,expect,_electron as electron} from '@playwright/test'
import {resolve} from 'node:path'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {examplePdf,exampleDocx,examplePptx} from '../fixtures/resource-library'

async function launch(){
  const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>{(window as any).__media=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){(window as any).__media.push(this);return play.call(this)}})
  await page.reload()
  await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
  await page.setViewportSize({width:1672,height:941});await page.getByRole('button',{name:'资料管理',exact:false}).click()
  return {app,page,errors}
}

test('Illustration lists scene thumbnails without names and Music includes scene tracks without sound effects',async()=>{
  test.setTimeout(120000)
  const {app,page,errors}=await launch()
  try{
    await page.getByRole('button',{name:'应用资源',exact:true}).click()
    await expect(page.getByRole('button',{name:'Illustration',exact:true})).toBeVisible()
    await expect(page.locator('.materials-resource-card')).toHaveCount(15)
    await expect(page.getByRole('button',{name:'查看资源 Aurore · 日常',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'查看资源 标题栏云层',exact:true})).toHaveCount(0);await expect(page.locator('.materials-resource-card .materials-resource-caption')).toHaveCount(0)
    await page.getByRole('button',{name:'查看资源 大礼堂 · 夜晚',exact:true}).click();await expect(page.locator('.materials-detail__name')).toHaveText('大礼堂 · 夜晚')
    await page.getByRole('button',{name:'Music',exact:true}).click();await expect(page.locator('.materials-track')).toHaveCount(6)
    await page.getByRole('button',{name:'查看资源 窓辺の余白',exact:true}).click();await page.getByRole('button',{name:'设为主页 BGM',exact:true}).click();await expect(page.getByRole('button',{name:'已使用',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.getByRole('button',{name:'切换主页音乐',exact:true}).click();await expect(page.getByRole('button',{name:'播放 窓辺の余白',exact:true})).toHaveAttribute('aria-pressed','true')
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('imports actual documents, previews real PDF/Office/text safely and retains copies across reload',async()=>{
  test.setTimeout(180000)
  const {app,page,errors}=await launch()
  try{
    const screen=page.getByRole('region',{name:'资料管理',exact:true})
    await expect(screen.getByText('添加你的学习资料')).toBeVisible()
    await page.locator('input[aria-label="导入文件"]').setInputFiles([
      {name:'高等数学教材.pdf',mimeType:'application/pdf',buffer:examplePdf()},
      {name:'讲义.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:exampleDocx()},
      {name:'导数课件.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:examplePptx()},
      {name:'课堂笔记.md',mimeType:'text/markdown',buffer:Buffer.from('# 真实笔记\n<script>window.bad=1</script>\n不应执行脚本')},
      {name:'旧格式.doc',mimeType:'application/msword',buffer:Buffer.from('legacy fixture')},
    ])
    await expect(screen.getByRole('status')).toContainText('完成 5 / 5')
    await screen.getByRole('button',{name:'查看资料 课堂笔记',exact:true}).click()
    await expect(page.locator('.document-text')).toContainText('真实笔记');expect(await page.evaluate(()=>(window as any).bad)).toBeUndefined()
    await page.getByRole('textbox',{name:'所属科目',exact:true}).fill('高等数学');await page.getByRole('button',{name:'保存分类信息',exact:true}).click()
    await screen.getByRole('button',{name:'查看资料 讲义',exact:true}).click();await expect(page.locator('.document-office article')).toContainText('真实 DOCX 讲义内容')
    await screen.getByRole('button',{name:'查看资料 导数课件',exact:true}).click();await expect(page.locator('.document-office article')).toContainText('真实课件首页');await expect(page.getByText('文件内容预览 · 不还原 Office 原始版式',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'下一张幻灯片'}).click();await expect(page.locator('.document-office article')).toContainText('实际第二页')
    await mkdir('build/reports/screenshots/materials',{recursive:true});await page.screenshot({path:'build/reports/screenshots/materials/learning.png'})
    await screen.getByRole('button',{name:'查看资料 高等数学教材',exact:true}).click();await expect(page.locator('canvas[aria-label="PDF 原始页面预览"]')).toHaveAttribute('data-rendered','true',{timeout:30000});await expect(page.locator('.document-page-controls')).toContainText('1 / 2');await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.document-page-controls')).toContainText('2 / 2');await expect(page.locator('canvas')).toHaveAttribute('data-page','2')
    const nonWhite=await page.locator('canvas').evaluate(el=>{const pixels=(el as HTMLCanvasElement).getContext('2d')!.getImageData(0,0,(el as HTMLCanvasElement).width,(el as HTMLCanvasElement).height).data;let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+3])dark++;return dark});expect(nonWhite).toBeGreaterThan(100)
    await screen.getByRole('button',{name:'查看资料 旧格式',exact:true}).click();await expect(screen.getByText('旧版 DOC 的转换器尚未接入，当前无法在应用内预览。')).toBeVisible()
    await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','');await page.getByRole('button',{name:'资料管理',exact:false}).click();await expect(page.getByRole('button',{name:'查看资料 课堂笔记',exact:true})).toBeVisible()
    await page.locator('input[aria-label="导入文件"]').setInputFiles({name:'重复笔记.md',mimeType:'text/markdown',buffer:Buffer.from('# 真实笔记\n<script>window.bad=1</script>\n不应执行脚本')});await expect(page.getByRole('status')).toContainText('重复 1')
    await page.setViewportSize({width:800,height:600});await page.getByRole('button',{name:'查看资料 课堂笔记',exact:true}).click();await expect(page.getByRole('button',{name:'收起详情',exact:true})).toBeInViewport();await page.screenshot({path:'build/reports/screenshots/materials/compact.png'})
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('scans an actual folder, shows skipped types, allows cancellation and imports only after confirmation',async()=>{
  test.setTimeout(90000)
  const {app,page,errors}=await launch()
  try{
    const directory=resolve('build/reports/materials-folder-fixture');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'课堂资料.txt'),'真实文件夹中的内容');await writeFile(resolve(directory,'other.bin'),'unsupported fixture')
    const input=page.locator('input[aria-label="选择资料文件夹"]')
    await input.setInputFiles(directory);const dialog=page.getByRole('dialog');await expect(dialog).toContainText('确认导入');await expect(dialog).toContainText('跳过 1 个不支持的文件');await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('button',{name:'查看资料 课堂资料',exact:true})).toHaveCount(0)
    await input.setInputFiles(directory);await dialog.getByRole('button',{name:'开始导入',exact:true}).click();await expect(page.locator('.materials-import [role=status]')).toContainText('完成 1 / 1');await page.getByRole('button',{name:'查看资料 课堂资料',exact:true}).click();await expect(page.locator('.document-text')).toContainText('真实文件夹中的内容')
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('imports background and music, previews original media, connects home and safely removes active resources',async()=>{
  test.setTimeout(180000)
  const {app,page,errors}=await launch()
  try{
    await page.getByRole('button',{name:'应用资源',exact:true}).click()
    await page.locator('input[aria-label="导入文件"]').setInputFiles({name:'我的教室.png',mimeType:'image/png',buffer:await readFile('assets/backgrounds/sipailou-classroom-day.png')})
    await expect(page.getByRole('status')).toContainText('完成 1 / 1')
    await page.getByRole('button',{name:'查看资源 我的教室',exact:true}).click();await expect(page.locator('.materials-resource-card .materials-resource-caption')).toHaveCount(0);await expect(page.getByAltText('我的教室原图预览')).toHaveAttribute('src',/^blob:/)
    await page.getByRole('button',{name:'预览首页',exact:true}).click();await expect(page.locator('.home-resource-preview')).toBeVisible();await expect(page.locator('.home__background')).toHaveAttribute('src',/^blob:/);await page.getByRole('button',{name:'应用此背景',exact:true}).click()
    await expect(page.getByRole('button',{name:'已使用',exact:true})).toBeVisible();await mkdir('build/reports/screenshots/materials',{recursive:true});await page.screenshot({path:'build/reports/screenshots/materials/resources.png'})
    await page.getByRole('button',{name:'Music',exact:true}).click()
    await page.locator('input[aria-label="导入文件"]').setInputFiles({name:'自定义日常.mp3',mimeType:'audio/mpeg',buffer:await readFile('assets/audio/bgm/suno-home-01.mp3')})
    await expect(page.getByRole('status')).toContainText('完成 1 / 1');await page.getByRole('button',{name:'查看资源 自定义日常',exact:true}).click();await expect(page.locator('.materials-detail audio')).toHaveAttribute('src',/^blob:/)
    await page.locator('.materials-detail audio').evaluate((element:HTMLAudioElement)=>element.play());await page.getByRole('button',{name:'设为主页 BGM',exact:true}).click();await expect(page.getByRole('button',{name:'已使用',exact:true})).toBeVisible()
    await page.locator('.materials-detail audio').evaluate((element:HTMLAudioElement)=>element.play())
    await page.getByRole('button',{name:'移除资源',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click()
    expect(await page.locator('.materials-detail audio').evaluate((element:HTMLAudioElement)=>element.paused)).toBe(true)
    await expect.poll(()=>page.evaluate(()=>(window as any).__media.filter((element:HTMLAudioElement)=>element.loop&&element.src.startsWith('blob:')).at(-1)?.paused)).toBe(false)
    await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.getByRole('button',{name:'切换主页音乐',exact:true}).click();await expect(page.getByRole('button',{name:'播放 自定义日常',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape')
    await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','');await page.getByRole('button',{name:'切换主页音乐',exact:true}).click();await expect(page.getByRole('button',{name:'播放 自定义日常',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'资料管理',exact:false}).click();await page.getByRole('button',{name:'应用资源',exact:true}).click();await page.getByRole('button',{name:'Music',exact:true}).click();await page.getByRole('button',{name:'查看资源 自定义日常',exact:true}).click();await page.getByRole('button',{name:'移除资源',exact:true}).click();await page.getByRole('button',{name:'确认移除',exact:true}).click();await expect(page.getByRole('button',{name:'查看资源 自定义日常',exact:true})).toHaveCount(0)
    await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','');await expect(page.locator('.home__background')).toHaveAttribute('src',/^blob:/)
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('previews saved PPTX slide order, reports corrupt files and retries PDF loading',async()=>{
  test.setTimeout(120000)
  const {app,page,errors}=await launch()
  try{
    await page.locator('input[aria-label="导入文件"]').setInputFiles([
      {name:'重排课件.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:examplePptx(true)},
      {name:'损坏.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a real pdf')},
      {name:'空文件.txt',mimeType:'text/plain',buffer:Buffer.alloc(0)},
    ])
    await expect(page.locator('.materials-import [role=status]')).toContainText('失败 1')
    await page.getByRole('button',{name:'查看资料 重排课件',exact:true}).click();await expect(page.locator('.document-office article')).toContainText('实际第二页')
    await page.getByRole('button',{name:'下一张幻灯片',exact:true}).click();await expect(page.locator('.document-office article')).toContainText('真实课件首页')
    await page.getByRole('button',{name:'查看资料 损坏',exact:true}).click();await expect(page.locator('.document-pdf .materials-error')).toContainText('PDF 无法预览')
    await page.getByRole('button',{name:'重新预览',exact:true}).click();await expect(page.locator('.document-pdf .materials-error')).toContainText('PDF 无法预览')
    await page.getByRole('button',{name:/^预览异常/}).click();await expect(page.getByRole('button',{name:'查看资料 损坏',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'查看资料 重排课件',exact:true})).toHaveCount(0)
    expect(errors).toEqual([])
  }finally{await app.close()}
})
