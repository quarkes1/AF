import {it,expect,afterEach,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {StoryStore} from '../../src/main/modules/story/store'
import {HomeChatService} from '../../src/main/modules/story/home-service'

const cleanup:(()=>void)[]=[]
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()))
function setup(worker:any){
 const root=mkdtempSync(join(tmpdir(),'af-home-chat-')),store=new StoryStore(root,{isRegistered:()=>true,isValidPng:()=>false,courseExists:()=>false})
 const provider={summary:()=>({configured:true}),get:()=>({baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'test-secret-not-persisted'}),intentHash:()=> 'test-provider-fingerprint'}
 let service=new HomeChatService(store,{provider,worker})
 cleanup.push(()=>{service.dispose();store.close();rmSync(root,{recursive:true,force:true})})
 const call=(command:string,payload:any={},scope?:{saveId:string;branchId:string},extra:any={})=>{
  const job=command.startsWith('jobs.'),chat=command.startsWith('story.')||command.startsWith('home.')
  const kind=job?'job':chat||command.startsWith('save.')?'save':command.startsWith('template.')?'template':command.startsWith('profile.')?'profile':'selection'
  const id=job?payload.jobId:chat?scope?.saveId:payload.id??payload.saveId??null
  const target={kind,id},saveId=scope?.saveId??payload.saveId??null,branchId=scope?.branchId??payload.branchId??null
  const read=['save.get','save.list','template.get','template.list','selection.get','profile.get','jobs.get','story.history','home.get'].includes(command)
  let version:number|null=null
  if(!read&&!command.endsWith('.create')){
   const getter=job?'jobs.get':chat?'save.get':command==='template.select'?'selection.get':payload.saveId?'save.get':payload.id?'template.get':'profile.get'
   const getPayload=job?{jobId:payload.jobId}:getter==='save.get'?{saveId}:getter==='template.get'?{id}:{}
   const get=service.request({protocolVersion:1,requestId:randomUUID(),command:getter,target:{kind:job?'job':getter.startsWith('save.')?'save':getter.startsWith('template.')?'template':getter.startsWith('profile.')?'profile':'selection',id:job?id:getter==='save.get'?saveId:getter==='template.get'?id:null},saveId:getter==='save.get'||job?saveId:null,branchId:job?branchId:null,expectedStateVersion:null,idempotencyKey:null,payload:getPayload})
   version=get.stateVersion
  }
  return service.request({protocolVersion:1,requestId:randomUUID(),command,target,saveId,branchId,expectedStateVersion:version,idempotencyKey:read?null:randomUUID(),payload,...extra})
 }
 const ok=(command:string,payload:any={},scope?:any,extra?:any)=>{const r=call(command,payload,scope,extra);if(!r.ok)throw new Error(r.error.code);return r.data as any}
 const create=()=>{const s=ok('save.create',{name:'测试故事',characterTemplateId:'af-guide',characterTemplateVersion:1,worldSetting:{mode:'realWorld',description:'现实校园'},partnerIdentity:'伙伴',userIdentity:'大学生',relationshipStart:'刚认识不久',courseIds:[]});ok('save.activate',{saveId:s.id,branchId:s.branchId});return{saveId:s.id,branchId:s.branchId}}
 const done=async(jobId:string,scope:any)=>{await vi.waitFor(()=>expect(['completed','failed','cancelled','superseded']).toContain(ok('jobs.get',{jobId},scope).status));return ok('jobs.get',{jobId},scope)}
 return{store,call,ok,create,done,get service(){return service},restart:()=>{service.dispose();service=new HomeChatService(store,{provider,worker})}}
}
const reply=(text:string)=>({reply:{segments:[{kind:'dialogue',text,poseTag:'01-neutral'}]},usage:{calls:1,tokens:50}})
it('keeps home chat separate from story dialogue, learning and story revision while retaining a small scene brief',async()=>{
 const inputs:any[]=[];const {ok,service,store,create,done}=setup(async(input:any)=>{inputs.push(input);return reply('首页的独立回答。')}),scope=create()
 store.transaction(()=>{service.repository.createTurn(scope,'主线中说过的话','story');service.repository.shared(scope,'plot','Aurore','主线的完整对白不应进入首页');service.repository.shared(scope,'scene','旁白','两人走到了图书馆。');service.repository.shared(scope,'teacher','资料解答','某道题的参考答案。')})
 const revision=store.save(scope.saveId).contextRevision,lastLine=store.save(scope.saveId).lastLine,job=ok('story.send',{channel:'home',text:'大厅里聊聊吧',anchor:null},scope);await done(job.jobId,scope)
 const state=ok('home.get',{},scope);expect(state.history.map((m:any)=>m.text)).toEqual(['大厅里聊聊吧']);expect(store.save(scope.saveId).contextRevision).toBe(revision);expect(store.save(scope.saveId).lastLine).toBe(lastLine)
 expect(inputs[0].bundle.history).toEqual([]);expect(inputs[0].bundle.recallHistory).toEqual([]);expect(JSON.stringify(inputs[0].bundle)).not.toContain('主线的完整对白');expect(JSON.stringify(inputs[0].bundle)).not.toContain('某道题的参考答案');expect(inputs[0].bundle.storyContext.sceneNotes).toEqual(['两人走到了图书馆。'])
 expect(service.repository.history(scope,null,100,'story').some(m=>m.text==='大厅里聊聊吧')).toBe(false)
})
it('cancels old scope work on activation and never publishes its late result to either save',async()=>{
 let finish:(value:any)=>void=()=>{};const worker=vi.fn(()=>new Promise(r=>{finish=r}))
 const {ok,create,done}=setup(worker),one=create(),job=ok('story.send',{channel:'home',text:'旧存档消息',anchor:null},one)
 await vi.waitFor(()=>expect(worker).toHaveBeenCalled());const two=create();finish(reply('旧存档迟到内容'))
 expect((await done(job.jobId,one)).status).toBe('cancelled');expect(ok('home.get',{},two).history).toEqual([]);expect(ok('home.get',{},one).reply).toBeNull()
})
it('fences retry after profile changes while allowing a new explicitly accepted turn',async()=>{
 const inputs:any[]=[];const {ok,create,done,call}=setup(async(input:any)=>{inputs.push(input);throw new Error('AUTHENTICATION_FAILED')})
 const scope=create(),job=ok('story.send',{channel:'home',text:'原消息',anchor:null},scope);await done(job.jobId,scope)
 ok('profile.update',{patch:{displayName:'新姓名'}})
 expect(call('jobs.retry',{jobId:job.jobId},scope)).toMatchObject({ok:false,error:{code:'CONTEXT_STALE'}})
 const next=ok('story.send',{channel:'home',text:'原消息',anchor:null},scope);await done(next.jobId,scope)
 expect(inputs[1].bundle.user.displayName).toBe('新姓名');expect(next.turnId).not.toBe(job.turnId)
})
it('accepts one input per idempotent intent and keeps generated but unseen text out of the next context and history',async()=>{
 const inputs:any[]=[];const worker=vi.fn(async(input:any)=>{inputs.push(input);return reply(inputs.length===1?'UNSEEN_DRAFT_SENTINEL':'第二次回复')})
 const {ok,create,done}=setup(worker),scope=create(),key=randomUUID()
 const first=ok('story.send',{channel:'home',text:'你好',anchor:null},scope,{idempotencyKey:key})
 expect(ok('story.send',{channel:'home',text:'你好',anchor:null},scope,{idempotencyKey:key}).jobId).toBe(first.jobId)
 await done(first.jobId,scope)
 const second=ok('story.send',{channel:'home',text:'继续',anchor:null},scope);await done(second.jobId,scope)
 expect(JSON.stringify(inputs[1].bundle)).not.toContain('UNSEEN_DRAFT_SENTINEL')
 const history=ok('story.history',{channel:'home',beforeEventSeq:null,limit:100},scope).items
 expect(history.filter((m:any)=>m.role==='user').map((m:any)=>m.text)).toEqual(['你好','继续']);expect(JSON.stringify(history)).not.toContain('UNSEEN_DRAFT_SENTINEL')
})
it('commits exactly the grapheme prefix actually presented and rejects foreign or conflicting receipts',async()=>{
 const {ok,call,create,done}=setup(async()=>reply('你👩‍🔬好，未显示的后半句')),scope=create(),other=create()
 ok('save.activate',{saveId:scope.saveId,branchId:scope.branchId})
 const accepted=ok('story.send',{channel:'home',text:'一起看看',anchor:null},scope);await done(accepted.jobId,scope)
 const page=ok('home.get',{},scope).reply.pages[0],receipt={receiptId:randomUUID(),actId:page.actId,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:page.scriptRevision,paginationVersion:page.paginationVersion,revealedGraphemeCount:2,channel:'home'}
 ok('story.present',{receipt},scope);ok('story.present',{receipt},scope)
 const history=ok('story.history',{channel:'home',beforeEventSeq:null,limit:100},scope).items
 expect(history.filter((m:any)=>m.role==='assistant').map((m:any)=>m.text)).toEqual(['你👩‍🔬'])
 expect(call('story.present',{receipt:{...receipt,revealedGraphemeCount:3}},scope)).toMatchObject({ok:false,error:{code:'IDEMPOTENCY_CONFLICT'}})
 expect(call('story.present',{receipt:{...receipt,receiptId:randomUUID()}},other).ok).toBe(false)
})
it('fences cancelled and superseded worker results, while preserving accepted inputs',async()=>{
 let release:(r:any)=>void=()=>{};const worker=vi.fn(()=>new Promise(r=>{release=r}))
 const {ok,create,done}=setup(worker),scope=create(),accepted=ok('story.send',{channel:'home',text:'先等等',anchor:null},scope)
 await vi.waitFor(()=>expect(worker).toHaveBeenCalled());ok('jobs.cancel',{jobId:accepted.jobId},scope);release(reply('LATE_FORBIDDEN'))
 expect((await done(accepted.jobId,scope)).status).toBe('cancelled');expect(ok('home.get',{},scope).reply).toBeNull()
 expect(ok('story.history',{channel:'home',beforeEventSeq:null,limit:100},scope).items[0].text).toBe('先等等')
})
it('retries a failed attempt with a new job and fresh session without duplicating user input',async()=>{
 const inputs:any[]=[];const worker=vi.fn(async(input:any)=>{inputs.push(input);if(inputs.length===1)throw new Error('AUTHENTICATION_FAILED');return reply('现在可以了')})
 const {ok,create,done}=setup(worker),scope=create(),first=ok('story.send',{channel:'home',text:'请回应',anchor:null},scope)
 expect((await done(first.jobId,scope)).status).toBe('failed')
 const retry=ok('jobs.retry',{jobId:first.jobId},scope);expect(retry.jobId).not.toBe(first.jobId);await done(retry.jobId,scope)
 expect(inputs[0].scope.sessionId).not.toBe(inputs[1].scope.sessionId)
 expect(ok('story.history',{channel:'home',beforeEventSeq:null,limit:100},scope).items.filter((m:any)=>m.role==='user')).toHaveLength(1)
})
it('does not auto-replay an unfinished model call after restart or expose private context via the public state',async()=>{
 const worker=vi.fn(()=>new Promise(()=>{})),{ok,create,restart}=setup(worker),scope=create(),accepted=ok('story.send',{channel:'home',text:'重启测试',anchor:null},scope)
 await vi.waitFor(()=>expect(worker).toHaveBeenCalledTimes(1));restart()
 expect(ok('jobs.get',{jobId:accepted.jobId},scope).status).toBe('failed');expect(worker).toHaveBeenCalledTimes(1)
 expect(JSON.stringify(ok('home.get',{},scope))).not.toMatch(/test-secret-not-persisted|systemPrompt|contextBundle/)
})
it('does not acknowledge a prefetched future page before the preceding page has actually appeared',async()=>{
 const {ok,call,create,done}=setup(async()=>({reply:{segments:[{kind:'dialogue',text:'第一页'},{kind:'dialogue',text:'未来页'}]},usage:{calls:1,tokens:20}})),scope=create()
 const job=ok('story.send',{channel:'home',text:'分页',anchor:null},scope);await done(job.jobId,scope)
 const page=ok('home.get',{},scope).reply.pages[1]
 const receipt={receiptId:randomUUID(),actId:page.actId,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:1,channel:'home'}
 expect(call('story.present',{receipt},scope)).toMatchObject({ok:false,error:{code:'BUFFER_NOT_READY'}})
 expect(ok('story.history',{channel:'home',beforeEventSeq:null,limit:100},scope).items.filter((m:any)=>m.role==='assistant')).toHaveLength(0)
})
it('seals hidden tails on stop and keeps only an acknowledged prefix available in history',async()=>{
 const {ok,create,done}=setup(async()=>reply('已见内容 HIDDEN_TAIL_SENTINEL')),scope=create(),job=ok('story.send',{channel:'home',text:'停止显示',anchor:null},scope)
 await done(job.jobId,scope);const page=ok('home.get',{},scope).reply.pages[0],anchor={actId:page.actId,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:4}
 ok('home.stop',{anchor},scope)
 const state=ok('home.get',{},scope);expect(JSON.stringify(state)).not.toContain('HIDDEN_TAIL_SENTINEL');expect(state.history.at(-1).text).toBe('已见内容');expect(state.reply.stopped).toBe(true)
})
it('keeps the retry budget on the original accepted turn',async()=>{
 const {ok,call,create,done}=setup(async()=>{throw new Error('RATE_LIMITED')}),scope=create()
 let job=ok('story.send',{channel:'home',text:'仅一条输入',anchor:null},scope)
 for(let attempt=0;attempt<3;attempt++){await done(job.jobId,scope);if(attempt<2)job=ok('jobs.retry',{jobId:job.jobId},scope)}
 expect(call('jobs.retry',{jobId:job.jobId},scope)).toMatchObject({ok:false,error:{code:'INPUT_REQUIRED'}})
 expect(ok('story.history',{channel:'home',beforeEventSeq:null,limit:100},scope).items.filter((m:any)=>m.role==='user')).toHaveLength(1)
})
