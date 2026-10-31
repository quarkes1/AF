import {test,expect,_electron as electron,type Page} from '@playwright/test'
import {cp,mkdtemp,mkdir,symlink,writeFile,rm} from 'node:fs/promises'
import {resolve,join,relative} from 'node:path'

// The copied test application has an explicit offline worker. Production build stays intact.
async function fixture(){
 const root=resolve('build/reports');await mkdir(root,{recursive:true})
 const folder=await mkdtemp(join(root,'home-chat-fixture-'))
 await cp(resolve('build/compiled/main'),join(folder,'main'),{recursive:true})
 await cp(resolve('build/compiled/preload'),join(folder,'preload'),{recursive:true})
 for(const name of ['renderer','resources'])await symlink(resolve('build/compiled',name),join(folder,name),'junction')
 await writeFile(join(folder,'main/character-agent.js'),`import {existsSync,writeFileSync} from 'node:fs';
process.on('message',input=>{const text=input.bundle.currentInput.text;const marker=new URL('./retry-'+input.bundle.currentInputEventId,import.meta.url);if(text.includes('[FAIL_ONCE]')&&!existsSync(marker)){writeFileSync(marker,'offline test');process.send({ok:false,error:'AUTHENTICATION_FAILED'});return}setTimeout(()=>process.send({ok:true,result:{reply:{segments:text.includes('[SHORT]')?[{kind:'dialogue',text:'好呀。'},{kind:'dialogue',text:'一起走吧。'}]:text.includes('[LONG]')?[{kind:'narration',text:'这是一段用于验证滚动视窗范围的叙述文字。'.repeat(12)},{kind:'dialogue',text:'一起走吧。'}]:[{kind:'dialogue',text:'今天的阳光很好，我们慢慢聊。这里还有没有显示的后半句话。'.repeat(text==='你好'?3:1),poseTag:'neutral'},{kind:'dialogue',text:'你想从哪里开始呢？',poseTag:'neutral'}]},usage:{calls:1,tokens:20}}}),text.includes('[DELAY]')?2000:100)})`)
 return{entry:join(folder,'main/index.js'),cleanup:async()=>{if(relative(root,folder).startsWith('home-chat-fixture-'))await rm(folder,{recursive:true,force:true})}}
}
async function enter(page:Page){
 await page.waitForFunction(()=>!!window.afStory)
 await page.evaluate(()=>localStorage.setItem('af.frontend-preview.preferences.v1',JSON.stringify({reducedMotion:true,muted:true})))
 await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
}
async function request(page:Page,command:string,payload:Record<string,unknown>={},scope?:{saveId:string;branchId:string}):Promise<any>{
 return page.evaluate(async({command,payload,scope})=>{
  const read=['home.get','save.get','selection.get','profile.get','jobs.get'].includes(command),home=command.startsWith('home.')||command.startsWith('story.'),job=command.startsWith('jobs.')
  const kind=job?'job':home||command.startsWith('save.')?'save':command.startsWith('profile.')?'profile':'selection'
  const id=job?payload.jobId:home?scope!.saveId:payload.saveId??null,saveId=home||job?scope!.saveId:payload.saveId??null,branchId=home||job?scope!.branchId:payload.branchId??null
  let version=null
  if(!read&&!command.endsWith('.create')){const get=job?'jobs.get':home||payload.saveId?'save.get':'selection.get';const r=await window.afStory!.request({protocolVersion:1,requestId:crypto.randomUUID(),command:get,target:{kind:job?'job':get==='save.get'?'save':'selection',id:job?id:get==='save.get'?saveId:null} as any,saveId:saveId as string|null,branchId:job?branchId as string:null,expectedStateVersion:null,idempotencyKey:null,payload:job?{jobId:id}:get==='save.get'?{saveId}:{}});if(!r.ok)throw new Error(r.error.message);version=r.stateVersion}
  const r=await window.afStory!.request({protocolVersion:1,requestId:crypto.randomUUID(),command,target:{kind,id} as any,saveId:saveId as string|null,branchId:branchId as string|null,expectedStateVersion:version,idempotencyKey:read?null:crypto.randomUUID(),payload});if(!r.ok)throw new Error(r.error.message);return r.data
 },{command,payload,scope})
}
test('home chat presents only visible prefixes, pauses while hidden, retries once and survives restart',async()=>{
 test.setTimeout(120000)
 const harness=await fixture();let app=await electron.launch({args:[harness.entry,'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
 try{
  let page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.webContents.setBackgroundThrottling(false)));await enter(page)
  const configured=await page.evaluate(()=>window.afMaterials!.request({protocolVersion:1,requestId:crypto.randomUUID(),command:'provider.configure',target:{kind:'provider',id:null},saveId:null,branchId:null,expectedStateVersion:null,idempotencyKey:crypto.randomUUID(),payload:{providerId:null,protocol:'openai',baseUrl:'https://api.deepseek.com',modelId:'deepseek-flash',keyAction:'replace',apiKey:'offline-test-not-a-real-key'}}));expect(configured.ok).toBe(true)
  const save=await request(page,'save.create',{name:'离线聊天验收',characterTemplateId:'af-guide',characterTemplateVersion:1,worldSetting:{mode:'realWorld',description:'校园'},partnerIdentity:'伙伴',userIdentity:'同学',relationshipStart:'刚认识',courseIds:[]})
  const scope={saveId:save.id,branchId:save.branchId};await request(page,'save.activate',scope);await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x')
  await page.locator('.home__portrait').click();const input=page.getByRole('textbox',{name:'想和 Aurore 说些什么？'}),send=page.getByRole('button',{name:'发送消息'})
  await input.fill('你好');await send.click();await expect(page.getByTestId('home-current-reply')).toContainText('今天',{timeout:15000})
  await expect.poll(async()=>{const s=await request(page,'home.get',{},scope);return s.history.some((m:any)=>m.role==='assistant')},{timeout:10000}).toBe(true)
  await page.getByRole('button',{name:'收起聊天'}).click()
  await expect.poll(async()=>{const s=await request(page,'home.get',{},scope);return s.history.some((m:any)=>m.role==='assistant')}).toBe(true)
  const hidden=await request(page,'home.get',{},scope),prefix=hidden.history.find((m:any)=>m.role==='assistant').text
  expect(prefix.length).toBeLessThan(30);await page.waitForTimeout(1500)
  expect((await request(page,'home.get',{},scope)).history.find((m:any)=>m.role==='assistant').text).toBe(prefix)
  await page.locator('.home__portrait').click();await expect(page.getByTestId('home-current-reply')).toContainText(prefix)
  await page.locator('.home-chat__reply').hover();await page.mouse.wheel(0,-500)
  await page.waitForTimeout(200);const scrolled=(await request(page,'home.get',{},scope)).history.find((m:any)=>m.role==='assistant').text
  await page.waitForTimeout(1200);expect((await request(page,'home.get',{},scope)).history.find((m:any)=>m.role==='assistant').text).toBe(scrolled)
  await page.getByRole('button',{name:'显示本段全文'}).click();await expect(page.getByTestId('home-current-reply')).toContainText('后半句话。')
  await page.getByRole('button',{name:'停止显示',exact:true}).click();await expect(page.getByText('已停止显示，未显示的部分不会进入共同历史。')).toBeVisible()
  await input.fill('[FAIL_ONCE] 重试测试');await send.click();await expect(page.getByRole('button',{name:'重试原消息'})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'重试原消息'}).click();await expect(page.getByTestId('home-current-reply')).toContainText('今天',{timeout:15000})
  expect((await request(page,'home.get',{},scope)).history.filter((m:any)=>m.role==='user'&&m.text.includes('[FAIL_ONCE]'))).toHaveLength(1)
  await page.getByRole('button',{name:'收起聊天'}).click();await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByTestId('settings-screen');await settings.getByRole('textbox',{name:'用户姓名',exact:true}).fill('新同学');await settings.getByRole('textbox',{name:'用户姓名',exact:true}).press('Enter');await expect.poll(async()=>(await request(page,'profile.get')).displayName).toBe('新同学');await settings.getByRole('button',{name:'返回首页',exact:true}).click()
  await page.locator('.home__portrait').click();await input.fill('改名后继续聊');await send.click();await expect.poll(async()=>(await request(page,'home.get',{},scope)).acceptedText).toBe('改名后继续聊');await expect(page.getByTestId('home-current-reply')).toContainText('今天',{timeout:15000})
  await input.fill('[SHORT]');await send.click();await expect(page.getByTestId('home-current-reply')).toContainText('好',{timeout:15000});await page.getByRole('button',{name:'显示本段全文'}).evaluate(el=>(el as HTMLButtonElement).click());await expect(page.getByTestId('home-current-reply')).toContainText('一起走吧。',{timeout:10000})
  await input.fill('[LONG]');await send.click();await expect(page.getByTestId('home-current-reply')).toContainText('叙述文字。',{timeout:15000});await expect.poll(async()=>{const s=await request(page,'home.get',{},scope);return s.history.find((m:any)=>m.id===s.reply?.replyId)?.text.length??0}).toBeGreaterThan(0)
  const long=await request(page,'home.get',{},scope);expect(long.history.find((m:any)=>m.id===long.reply.replyId).text.length).toBeLessThan(long.reply.pages[0].text.length)
  for(let i=0;i<20;i++){
   const state=await request(page,'home.get',{},scope),first=state.reply.pages[0],count=first.revealedGraphemeCount;if(count===first.graphemeCount)break
   await page.locator('.home-chat__reply').evaluate((el,{id,count})=>{const node=el.querySelector(`[data-page-id="${id}"]`)!.firstChild!,range=document.createRange();range.setStart(node,count);range.setEnd(node,count+1);el.scrollTop+=range.getBoundingClientRect().top-el.getBoundingClientRect().top-2},{id:first.pageId,count})
   await expect.poll(async()=>(await request(page,'home.get',{},scope)).reply.pages[0].revealedGraphemeCount).toBeGreaterThan(count)
  }
  await expect(page.getByTestId('home-current-reply')).toContainText('一起走吧。',{timeout:10000})
  await page.waitForTimeout(400);const profile=await app.evaluate(({app})=>app.getPath('userData'))
  await page.waitForTimeout(350)
  await page.screenshot({path:resolve('build/reports/home-chat-native.png')})
  await app.close();app=await electron.launch({args:[harness.entry,'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1',AF_TEST_PROFILE:profile}});page=await app.firstWindow();await enter(page)
  const restored=await request(page,'home.get',{},scope);expect(restored.history.filter((m:any)=>m.role==='user')).toHaveLength(5);expect(restored.history.some((m:any)=>m.role==='assistant')).toBe(true)
 }catch(error){const page=await app.firstWindow();await page.screenshot({path:resolve('build/reports/home-chat-failure.png')});console.log(await page.evaluate(()=>({visibility:document.visibilityState,alert:document.querySelector('[role="alert"]')?.textContent,reply:document.querySelector('[data-testid="home-current-reply"]')?.outerHTML,viewport:document.querySelector('.home-chat__reply')?.getBoundingClientRect().toJSON(),textRect:document.querySelector('[data-page-id]')?.getBoundingClientRect().toJSON()})));throw error}finally{await app.close();await harness.cleanup()}
})
