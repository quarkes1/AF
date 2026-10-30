import {test,expect,_electron as electron} from '@playwright/test'
import type {Page} from '@playwright/test'
import {resolve} from 'node:path'

async function home(page:Page){await page.waitForFunction(()=>!!window.afStory);await page.evaluate(()=>localStorage.setItem('af.frontend-preview.preferences.v1',JSON.stringify({reducedMotion:true,muted:true})));await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')}
test('native companion and story lifecycle survives full restart and keeps archived character identities',async()=>{
 test.setTimeout(180000)
 let app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
 const profile=await app.evaluate(({app})=>app.getPath('userData'))
 try{
  let page=await app.firstWindow();await home(page)
  await page.getByRole('button',{name:/^搭档档案/}).click();await page.getByRole('button',{name:'查看 Aurore 档案'}).click();await page.getByRole('button',{name:'编辑搭档',exact:true}).click()
  await page.getByRole('textbox',{name:'搭档姓名',exact:true}).fill('持久伙伴');await page.locator('input[aria-label="选择 PNG 立绘"]').setInputFiles(resolve('assets/characters/aurore/sprites/01-neutral.png'));await expect(page.getByRole('button',{name:'保存搭档',exact:true})).toBeEnabled();await page.getByRole('button',{name:'保存搭档',exact:true}).click();await expect(page.getByRole('heading',{name:'关于 持久伙伴'})).toBeVisible()
  await page.getByRole('button',{name:'选中',exact:true}).click();await expect(page.getByRole('button',{name:'已选中',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'返回搭档库'}).click();await page.getByTestId('companion-screen').getByRole('button',{name:'返回首页',exact:true}).click()
  await page.locator('.home__save').click();const saves=page.getByTestId('save-screen')
  await saves.getByRole('button',{name:'新建故事',exact:true}).first().click();const create=page.getByRole('dialog',{name:'新建故事'})
  await create.getByRole('textbox',{name:'故事名称',exact:true}).fill('重启后的起点');await create.getByRole('textbox',{name:'用户身份',exact:true}).fill('旁听生');await create.getByRole('textbox',{name:'关系起点',exact:true}).fill('一起参加过活动')
  await create.getByRole('button',{name:'创建故事',exact:true}).click();await expect(create).not.toBeVisible();await expect(saves.getByRole('button',{name:'选择故事 重启后的起点'})).toBeVisible()
  await saves.getByRole('button',{name:'继续故事',exact:true}).click();await expect(saves.getByRole('status')).toContainText('已激活故事')
  await app.close();app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1',AF_TEST_PROFILE:profile}})
  page=await app.firstWindow();await home(page);await expect(page.locator('.home__portrait')).toHaveAttribute('aria-label','与 持久伙伴 聊聊');await page.locator('.home__portrait').click();await page.getByRole('textbox',{name:'想和 持久伙伴 说些什么？'}).fill('此处仍是草稿');await page.getByRole('button',{name:'发送消息'}).click();await expect(page.getByText('聊天服务尚未接入')).toBeVisible();await expect(page.getByText('先创建一个故事')).toHaveCount(0);await page.getByRole('button',{name:'收起聊天'}).click()
  const snapshot=await page.evaluate(async()=>{const base={protocolVersion:1 as const,requestId:crypto.randomUUID(),target:{kind:'selection' as const,id:null},saveId:null,branchId:null,expectedStateVersion:null,idempotencyKey:null};const selected=await window.afStory!.request({...base,command:'selection.get',payload:{}});if(!selected.ok)throw new Error(selected.error.message);const s=selected.data as {saveId:string};const result=await window.afStory!.request({...base,target:{kind:'save',id:s.saveId},saveId:s.saveId,command:'save.get',payload:{saveId:s.saveId}});if(!result.ok)throw new Error(result.error.message);return result.data as any})
  expect(snapshot.characterSnapshot.content.userIdentity).toBe('旁听生');expect(snapshot.characterSnapshot.content.relationship).toBe('一起参加过活动')
  await expect(page.locator('.home__portrait img')).toHaveAttribute('src',/^data:image\/png;base64,/)
  await page.getByRole('button',{name:/^搭档档案/}).click();await page.getByRole('button',{name:'查看 持久伙伴 档案'}).click();await page.getByRole('button',{name:'编辑搭档',exact:true}).click();await page.getByRole('textbox',{name:'搭档姓名',exact:true}).fill('模板已改名');await page.getByRole('button',{name:'保存搭档',exact:true}).click()
  await expect(page.getByRole('heading',{name:'关于 模板已改名'})).toBeVisible();await page.getByRole('button',{name:'返回搭档库'}).click();await page.getByTestId('companion-screen').getByRole('button',{name:'返回首页',exact:true}).click();await expect(page.locator('.home__portrait')).toHaveAttribute('aria-label','与 持久伙伴 聊聊')
  await page.locator('.home__save').click();await expect(page.getByRole('button',{name:'选择故事 重启后的起点'})).toHaveAttribute('aria-pressed','true');await page.getByTestId('save-screen').getByRole('button',{name:'重命名',exact:true}).click();const rename=page.getByRole('dialog',{name:'重命名故事'});await rename.getByRole('textbox',{name:'故事名称',exact:true}).fill('故事已改名');await rename.getByRole('button',{name:'保存名称'}).click();await expect(page.getByRole('button',{name:'选择故事 故事已改名'})).toBeVisible()
 }finally{await app.close()}
})
