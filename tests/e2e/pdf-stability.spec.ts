import {test,expect,_electron as electron,type Page} from '@playwright/test'
import {resolve} from 'node:path'
import {examplePdf} from '../fixtures/resource-library'

async function sampleFrames(page:Page){
  return page.locator('canvas[aria-label="PDF 原始页面预览"]').evaluate(async element=>{
    const samples:{width:number;height:number;hostWidth:number;top:number}[]=[]
    let writes=0
    const observer=new MutationObserver(records=>{writes+=records.length})
    observer.observe(element,{attributes:true,attributeFilter:['width','height']})
    for(let frame=0;frame<120;frame++){
      await new Promise(resolve=>setTimeout(resolve,16))
      const box=element.getBoundingClientRect(),host=element.parentElement!
      samples.push({width:box.width,height:box.height,hostWidth:host.clientWidth,top:box.top})
    }
    observer.disconnect()
    return {sizes:[...new Set(samples.map(sample=>`${sample.width.toFixed(2)}x${sample.height.toFixed(2)}`))],writes,hostWidths:[...new Set(samples.map(sample=>sample.hostWidth))]}
  })
}

test('PDF remains stable across consecutive frames at the scrollbar overflow threshold and after resize',async()=>{
  test.setTimeout(120000)
  const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  try{
  await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.webContents.setBackgroundThrottling(false);window.showInactive()})
    await page.setViewportSize({width:1672,height:941});await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    await page.getByRole('button',{name:'资料管理',exact:false}).click()
    const input=page.locator('input[aria-label="导入文件"]')
    await input.setInputFiles({name:'测量.pdf',mimeType:'application/pdf',buffer:examplePdf()});await expect(page.locator('.materials-import [role=status]')).toContainText('完成 1 / 1');await page.getByRole('button',{name:'查看资料 测量',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-page','1')
    await page.waitForTimeout(500)
    const width=await page.locator('.document-pdf__canvas').evaluate(element=>element.getBoundingClientRect().width)
    const height=430*360/(width-8-3)
    await input.setInputFiles({name:'临界比例.pdf',mimeType:'application/pdf',buffer:examplePdf(height)});await expect(page.locator('.materials-import [role=status]')).toContainText('完成 1 / 1');await page.getByRole('button',{name:'查看资料 临界比例',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-page','1')
    // Wait until the deliberate detail-opening transition has settled, then inspect
    // consecutive frames and native canvas writes rather than a static screenshot.
    await page.waitForTimeout(400)
    const before=await sampleFrames(page)
    expect(before.sizes,JSON.stringify(before)).toHaveLength(1)
    expect(before.writes,JSON.stringify(before)).toBeLessThanOrEqual(2)
    await page.setViewportSize({width:1200,height:800});await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-page','2')
    const after=await sampleFrames(page)
    expect(after.sizes,JSON.stringify(after)).toHaveLength(1)
    expect(after.writes,JSON.stringify(after)).toBeLessThanOrEqual(2)
    await test.info().attach('pdf-size-samples',{body:JSON.stringify({before,after}),contentType:'application/json'})
    expect(errors).toEqual([])
  }finally{await app.close()}
})
