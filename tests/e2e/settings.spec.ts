import {test,expect,_electron as electron} from '@playwright/test'
import {resolve} from 'node:path'
import {mkdir} from 'node:fs/promises'

test('settings are one continuous page with sticky anchors, real local preferences and honest unavailable services',async()=>{
  test.setTimeout(180000)
  const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  try{
    await page.setViewportSize({width:1672,height:941})
    await page.addInitScript(()=>{(window as any).__media=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){(window as any).__media.push(this);return play.call(this)}})
    await page.evaluate(()=>{localStorage.clear();localStorage.setItem('af.frontend-preview.preferences.v1',JSON.stringify({muted:false,reducedMotion:false}))});await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
    await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByTestId('settings-screen');await expect(settings).toBeVisible()
    await expect(page.getByRole('navigation',{name:'设置分类'}).getByRole('button')).toHaveCount(6)
    await expect(settings.locator('.settings-section')).toHaveCount(6)
    const nav=page.getByRole('navigation',{name:'设置分类'}),navY=(await nav.boundingBox())!.y
    await mkdir('build/reports/screenshots/settings',{recursive:true});await expect(settings).toHaveCSS('opacity','1');await page.screenshot({path:'build/reports/screenshots/settings/display.png'})
    await settings.getByRole('slider',{name:'操作音效音量',exact:true}).fill('85')
    await settings.getByRole('button',{name:'试听操作音',exact:true}).click()
    expect(await page.evaluate(()=>(window as any).__media.filter((audio:HTMLMediaElement)=>audio.src.includes('/sfx/')).at(-1).volume)).toBeCloseTo(.51)
    await settings.getByRole('checkbox',{name:'静音',exact:true}).check();await expect(settings.getByRole('button',{name:'试听操作音',exact:true})).toBeDisabled();await settings.getByRole('checkbox',{name:'静音',exact:true}).uncheck()
    await nav.getByRole('button',{name:'模型与预算',exact:true}).click();await expect(nav.getByRole('button',{name:'模型与预算',exact:true})).toHaveAttribute('aria-current','location')
    await expect(settings.getByLabel('API Key',{exact:true})).toBeDisabled();expect((await nav.boundingBox())!.y).toBeCloseTo(navY,1)
    await expect(nav.getByRole('button',{name:'模型与预算',exact:true})).toHaveCSS('border-bottom-color','rgb(53, 197, 237)');await page.screenshot({path:'build/reports/screenshots/settings/model.png'})
    await nav.getByRole('button',{name:'搭档与互动',exact:true}).click();await settings.getByRole('textbox',{name:'用户姓名',exact:true}).fill('新同学');await page.keyboard.press('Tab');await expect(settings.getByText('姓名牌：新同学',{exact:true})).toBeVisible()
    await settings.getByRole('button',{name:/打开搭档档案/}).click();await expect(page.getByTestId('companion-screen')).toBeVisible();await page.getByRole('button',{name:'返回设置',exact:true}).click();await expect(settings).toBeVisible();await expect(settings.getByRole('button',{name:/打开搭档档案/})).toBeFocused()
    await nav.getByRole('button',{name:'存档与数据',exact:true}).click();await settings.getByRole('button',{name:/打开存档页面/}).click();await expect(page.getByTestId('save-screen')).toBeVisible();await page.getByRole('button',{name:'返回设置',exact:true}).click();await expect(settings).toBeVisible()
    const scroller=page.locator('.settings-scroll');await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight});await expect(nav.getByRole('button',{name:'帮助与诊断',exact:true})).toHaveAttribute('aria-current','location')
    await nav.getByRole('button',{name:'显示与声音',exact:true}).click();await settings.getByRole('combobox',{name:'界面字号',exact:true}).selectOption('150');await expect(page.locator('html')).toHaveCSS('font-size','24px');await settings.getByRole('checkbox',{name:'逐字字幕',exact:true}).uncheck();await expect(settings.getByRole('slider',{name:'字幕速度',exact:true})).toBeDisabled()
    await page.setViewportSize({width:800,height:600});await page.screenshot({path:'build/reports/screenshots/settings/compact-150.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.keyboard.press('Escape');await expect(settings).toBeHidden();await expect(page.getByRole('button',{name:'设置',exact:true})).toBeFocused()
    expect(await page.evaluate(()=>(window as any).__media.filter((audio:HTMLMediaElement)=>audio.src.includes('suno-home-01')).length)).toBe(1)
    await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','');await page.getByRole('button',{name:'设置',exact:true}).click()
    await expect(settings.getByRole('slider',{name:'操作音效音量',exact:true})).toHaveValue('85');await expect(settings.getByRole('checkbox',{name:'逐字字幕',exact:true})).not.toBeChecked();await expect(settings.getByRole('combobox',{name:'界面字号',exact:true})).toHaveValue('150')
    await nav.getByRole('button',{name:'搭档与互动',exact:true}).click();await expect(settings.getByRole('textbox',{name:'用户姓名',exact:true})).toHaveValue('新同学')
    await page.emulateMedia({reducedMotion:'reduce'});await nav.getByRole('button',{name:'显示与声音',exact:true}).click();await expect(settings.locator('option[value="full"]')).not.toBeDisabled();await settings.getByRole('combobox',{name:'动画强度',exact:true}).selectOption('full');await expect(page.locator('.app')).toHaveAttribute('data-motion','full')
    await settings.locator('#settings-display').getByRole('button',{name:'恢复本组默认',exact:true}).click();await expect(page.locator('.app')).toHaveAttribute('data-motion','full')
    expect(errors).toEqual([])
  }finally{await app.close()}
})
