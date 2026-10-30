import {test,expect,_electron as electron} from '@playwright/test'
import {resolve} from 'node:path'
import {exampleDocx,examplePdf} from '../fixtures/resource-library'

test('desktop SQLite imports, parses, protects manual categories and retains them across reload',async()=>{
 test.setTimeout(120000)
 const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
 const page=await app.firstWindow()
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','')
  await page.getByRole('button',{name:/^资料管理/}).click()
  await page.locator('input[aria-label="导入文件"]').setInputFiles([{name:'数分笔记.md',mimeType:'text/markdown',buffer:Buffer.from('# 数学分析\n\n极限与连续性')},{name:'原讲义.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:exampleDocx()}])
  await expect(page.locator('.materials-import [role=status]')).toContainText('完成 2 / 2')
  await page.getByRole('button',{name:'查看资料 数分笔记',exact:true}).click()
  await expect(page.getByText(/处理状态：已解析/)).toBeVisible({timeout:30000})
  const subject=page.getByRole('textbox',{name:'所属科目',exact:true});await subject.fill('数学分析');await page.getByRole('button',{name:'保存分类信息'}).click();await expect(page.getByText(/已手动指定科目/)).toBeVisible()
  await page.getByRole('textbox',{name:'来源检索',exact:true}).fill('连续性');await page.getByRole('button',{name:'检索已解析资料'}).click();await expect(page.getByRole('button',{name:'定位来源'})).toBeVisible()
  await page.getByRole('button',{name:'查看资料 原讲义',exact:true}).click();await page.getByRole('textbox',{name:'所属科目',exact:true}).fill('数学分析');await page.getByRole('button',{name:'保存分类信息'}).click();await expect(page.getByText(/已手动指定科目/)).toBeVisible()
  const state=await page.evaluate(async()=>{const r=await window.afMaterials!.request({protocolVersion:1,requestId:crypto.randomUUID(),command:'course.list',target:{kind:'course',id:null},saveId:null,branchId:null,expectedStateVersion:null,idempotencyKey:null,payload:{}});return r.ok?r.data:null}) as {items:unknown[]}
  expect(state.items).toHaveLength(1)
  await page.reload();await page.keyboard.press('Escape');await expect(page.getByTestId('title-screen')).toBeVisible();await page.keyboard.press('x');await expect(page.getByTestId('home')).not.toHaveAttribute('inert','');await page.getByRole('button',{name:/^资料管理/}).click();await page.getByRole('button',{name:'查看资料 数分笔记',exact:true}).click();await expect(subject).toHaveValue('数学分析')
  expect(errors).toEqual([])
 }finally{await app.close()}
})

test('material IPC rejects untrusted fields, stale writes, foreign targets and conflicting idempotency',async()=>{
 const app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}}),page=await app.firstWindow()
 try{
  await page.waitForFunction(()=>!!window.afMaterials)
  const result=await page.evaluate(async()=>{
   const base={protocolVersion:1 as const,requestId:crypto.randomUUID(),target:{kind:'resource' as const,id:null},saveId:null,branchId:null,expectedStateVersion:null,idempotencyKey:crypto.randomUUID()}
   const payload={filename:'自己写的.txt',kind:'document',bytes:new TextEncoder().encode('数列极限'),metadata:{mime:'text/plain'}}
   const one=await window.afMaterials!.request({...base,command:'resource.upload',payload})
   const duplicate=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),command:'resource.upload',payload})
   const conflict=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),command:'resource.upload',payload:{...payload,filename:'不同意图.txt'}})
   const unknown=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),command:'resource.upload',payload:{...payload,userId:'another-user'}})
   const nullPayload=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),command:'resource.upload',payload:null})
   const foreign=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),command:'resource.upload',target:{kind:'course',id:null},payload})
   if(!one.ok||!duplicate.ok)throw new Error('正常导入失败')
   const id=(one.data as any).id
   const stale=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),expectedStateVersion:99999,command:'resource.update',target:{kind:'resource',id},payload:{id,patch:{name:'不应生效'}}})
   const providerIntent={...base,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),command:'provider.configure',target:{kind:'provider' as const,id:null},payload:{providerId:null,protocol:'openai',baseUrl:'https://api.deepseek.com',modelId:'deepseek-flash',keyAction:'replace',apiKey:'not-a-real-key-one'}}
   const configured=await window.afMaterials!.request(providerIntent)
   const changedSecret=await window.afMaterials!.request({...providerIntent,requestId:crypto.randomUUID(),payload:{...providerIntent.payload,apiKey:'not-a-real-key-two'}})
   const publicProfile=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),command:'provider.list',target:{kind:'provider',id:null},idempotencyKey:null,payload:{}})
   return{sameId:id===(duplicate.data as any).id,conflict:conflict.ok?null:conflict.error.code,unknown:unknown.ok?null:unknown.error.code,nullPayload:nullPayload.ok?null:nullPayload.error.code,foreign:foreign.ok?null:foreign.error.code,stale:stale.ok?null:stale.error.code,secretConflict:changedSecret.ok?null:changedSecret.error.code,versionAdvanced:configured.ok&&configured.stateVersion>one.stateVersion,redacted:!JSON.stringify(publicProfile).includes('not-a-real-key')}
  })
  expect(result).toEqual({sameId:true,conflict:'IDEMPOTENCY_CONFLICT',unknown:'INVALID_PAYLOAD',nullPayload:'INVALID_PAYLOAD',foreign:'FORBIDDEN',stale:'STALE_STATE',secretConflict:'IDEMPOTENCY_CONFLICT',versionAdvanced:true,redacted:true})
 }finally{await app.close()}
})

test('managed files, course choices and encrypted provider profile survive a full Electron restart',async()=>{
 test.setTimeout(60000)
 let app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1'}})
 const profile=await app.evaluate(({app})=>app.getPath('userData'))
 try{
  let page=await app.firstWindow();await page.waitForFunction(()=>!!window.afMaterials)
  const initial=await page.evaluate(async()=>{
   const base={protocolVersion:1 as const,requestId:crypto.randomUUID(),target:{kind:'resource' as const,id:null},saveId:null,branchId:null,expectedStateVersion:null,idempotencyKey:crypto.randomUUID()}
   const response=await window.afMaterials!.request({...base,command:'resource.upload',payload:{filename:'跨进程资料.txt',kind:'document',bytes:new TextEncoder().encode('重启后仍然存在的正文'),metadata:{mime:'text/plain'}}})
   if(!response.ok)throw new Error(response.error.message)
   const id=(response.data as any).id
   const assignment=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),command:'course.assignName',target:{kind:'course',id:null},payload:{documentVersionId:id,name:'数学分析',decision:'direct',existingId:null}})
   if(!assignment.ok)throw new Error(assignment.error.message)
   const provider=await window.afMaterials!.request({...base,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),command:'provider.configure',target:{kind:'provider',id:null},payload:{providerId:null,protocol:'openai',baseUrl:'https://api.deepseek.com',modelId:'deepseek-flash',keyAction:'replace',apiKey:'not-a-real-restart-test-key'}})
   if(!provider.ok)throw new Error(provider.error.message)
   return id
  })
  await app.close()
  app=await electron.launch({args:[resolve('build/compiled/main/index.js'),'--mute-audio'],env:{...process.env,AF_TEST_MODE:'1',AF_TEST_PROFILE:profile}})
  page=await app.firstWindow();await page.waitForFunction(()=>!!window.afMaterials)
  const restored=await page.evaluate(async id=>{
   const call=async(command:string,payload:unknown={},kind:'resource'|'provider'='resource')=>{const r=await window.afMaterials!.request({protocolVersion:1,requestId:crypto.randomUUID(),command,target:{kind,id:null},saveId:null,branchId:null,expectedStateVersion:null,idempotencyKey:null,payload});if(!r.ok)throw new Error(r.error.message);return r.data as any}
   const list=await call('resource.list',{limit:100}),bytes=await call('resource.read',{id,offset:0,length:1024}),provider=await call('provider.list',{},'provider')
   return{subject:list.items.find((x:any)=>x.id===id)?.subject,text:new TextDecoder().decode(bytes),configured:provider.configured,redacted:!JSON.stringify(provider).includes('not-a-real')}
  },initial)
  expect(restored).toEqual({subject:'数学分析',text:'重启后仍然存在的正文',configured:true,redacted:true})
 }finally{await app.close()}
})
