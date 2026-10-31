import {it,expect,afterEach,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {StoryStore} from '../../src/main/modules/story/store'
import {HomeChatService} from '../../src/main/modules/story/home-service'
import {ExperienceService} from '../../src/main/modules/story/experience-service'

const clean:(()=>void)[]=[];afterEach(()=>clean.splice(0).forEach(fn=>fn()))
const source={documentVersionId:'document-one',blockId:'block-one',page:1,fingerprint:'a'.repeat(64)}
const text=(value:string)=>({kind:'text',text:value,sourceRefs:[source]})
const act=(n=16)=>({title:'全新的起点',nodes:Array.from({length:n},(_,i)=>({kind:'dialogue',speaker:'partner',blocks:[{kind:'text',text:`第${i+1}页：今天我们一起走过熟悉的校园，聊聊各自最近遇到的小事。`,sourceRefs:[]}],poseTag:'01-neutral',backgroundId:null,choices:[]})),ending:'actEnd'})
const lesson=()=>({title:'电压的概念',objectives:['理解电压单位'],textbook:[text('电压的单位为伏特。')],blackboard:[text('电压表示单位电荷的能量变化。')],questions:[{type:'single',prompt:[text('电压的单位是什么？')],choices:[{id:'v',label:'伏特'},{id:'a',label:'安培'}],answer:{choiceIds:['v']},rubric:['识别伏特'],hint:'想想电势差。',explanation:[text('资料明确指出电压的单位为伏特。')],sourceRefs:[source],tolerance:'0'}],sourceRefs:[source],coverage:'覆盖用户提供的一页资料。',warnings:[]})
function setup(worker:any=async(input:any)=>({output:input.bundle.purpose==='scriptDraft'?act():input.operation==='verifyQuestions'?{verdicts:[{index:0,status:'verified',reason:'原文明确给出电压单位为伏特。',sourceRefs:[source]}]}:lesson(),usage:{calls:1,tokens:100}})){
 const root=mkdtempSync(join(tmpdir(),'af-experience-')),store=new StoryStore(root,{isRegistered:()=>true,isValidPng:()=>false,courseExists:()=>true}),provider={summary:()=>({configured:true}),get:()=>({baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'test-private'}),intentHash:()=> 'test-fingerprint'}
 const home=new HomeChatService(store,{provider,worker:async()=>({reply:{segments:[{kind:'dialogue',text:'你好。'}]},usage:{calls:1,tokens:10}})})
 const sources={learningSource:()=>({courseId:'course-one',courseName:'电路',chapterId:'chapter-one',chapterTitle:'电压',chapterMapVersion:1,textbookStatus:'generic',textbookTitle:'资料目录',documentVersionIds:['document-one'],blocks:[{ref:source,text:'电压的单位为伏特。',quality:'native' as const,kind:'paragraph'}],coverage:{totalBlocks:1,includedBlocks:1,truncated:false}})}
 const service=new ExperienceService(store,{home,provider,sources,worker,backgroundIds:new Set(['background.library-hall-day'])})
 clean.push(()=>{service.dispose();home.dispose();store.close();rmSync(root,{recursive:true,force:true})})
 const call=(command:string,payload:any={},scope:any=null,key?:string)=>{
  const job=command.startsWith('jobs.'),kind=job?'job':command.startsWith('template.')?'template':command.startsWith('selection.')?'selection':'save',saveId=scope?.saveId??payload.saveId??null,branchId=scope?.branchId??payload.branchId??null,id=job?payload.jobId:kind==='template'?payload.id??null:kind==='selection'?null:saveId
  const reads=['save.get','save.list','selection.get','story.buffer.status','story.page.get','story.history','save.checkpoints','save.replay','learning.get','jobs.get'].includes(command)
  const version=command.endsWith('.create')?null:job?service.jobVersion(payload.jobId):saveId?store.save(saveId).stateVersion:null
  return service.request({protocolVersion:1,requestId:randomUUID(),command,target:{kind,id},saveId,branchId,expectedStateVersion:version,idempotencyKey:reads?null:key??randomUUID(),payload})
 }
 const ok=(...args:Parameters<typeof call>)=>{const r=call(...args);if(!r.ok)throw new Error(r.error.code+':'+r.error.message);return r.data as any}
 const create=()=>{const save=ok('save.create',{name:'验收故事',characterTemplateId:'af-guide',characterTemplateVersion:1,worldSetting:{mode:'realWorld',description:'校园'},partnerIdentity:'伙伴',userIdentity:'学生',relationshipStart:'刚认识',courseIds:[]});const scope={saveId:save.id,branchId:save.branchId};ok('save.activate',scope,scope);return scope}
 const done=async(id:string,scope:any)=>{await vi.waitFor(()=>expect(['completed','failed','cancelled','superseded']).toContain(ok('jobs.get',{jobId:id},scope).status));return ok('jobs.get',{jobId:id},scope)}
 return{store,service,home,ok,call,create,done}
}
it('prepares an entire act, requires actual presentation before advance and keeps future pages out of history',async()=>{
 const {ok,call,create,done}=setup(),scope=create(),accepted=ok('story.prepare',{actId:null,mode:'normal'},scope)
 const job=await done(accepted.jobId,scope);expect(job.status).toBe('completed');const state=ok('story.buffer.status',{actId:job.resultRef,scriptRevision:1},scope)
 expect(state.complete).toBe(true);expect(state.validFollowingPages).toBe(15)
 const first=ok('story.page.get',{actId:job.resultRef,scriptRevision:1,pageId:state.cursor.pageId},scope).page
 expect(call('story.advance',{actId:first.actId,scriptRevision:1,pageId:first.pageId,action:'next',revealedGraphemeCount:first.graphemeCount},scope)).toMatchObject({ok:false,error:{code:'BUFFER_NOT_READY'}})
 ok('story.advance',{actId:first.actId,scriptRevision:1,pageId:first.pageId,action:'revealAll',revealedGraphemeCount:first.graphemeCount},scope)
 expect(ok('story.history',{beforeEventSeq:null},scope).items).toEqual([])
 const receipt={receiptId:randomUUID(),actId:first.actId,nodeId:first.nodeId,pageId:first.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:3,channel:'story'}
 ok('story.present',{receipt},scope);expect(ok('story.history',{beforeEventSeq:null},scope).items.at(-1).text).toBe(first.blocks[0].text.slice(0,3))
 const {receiptId:_,channel:__,...anchor}=receipt
 const interrupted=ok('story.interrupt',{actId:first.actId,scriptRevision:1,anchor,text:'换个话题'},scope)
 await done(interrupted.jobId,scope);expect(call('story.present',{receipt:{...receipt,receiptId:randomUUID(),revealedGraphemeCount:8}},scope).ok).toBe(false)
})
it('does not rewrite a cached act or import home chat into the author session',async()=>{
 const inputs:any[]=[],{ok,store,create,done}=setup(async(input:any)=>{inputs.push(input);return{output:act(),usage:{calls:1,tokens:10}}}),scope=create(),initial=ok('story.prepare',{actId:null,mode:'normal'},scope),id=(await done(initial.jobId,scope)).resultRef,version=store.save(scope.saveId).contextRevision
 const chat=ok('story.send',{channel:'home',text:'这句话只属于首页私聊',anchor:null},scope);await done(chat.jobId,scope)
 expect(store.save(scope.saveId).contextRevision).toBe(version);expect(ok('story.prepare',{actId:id,mode:'normal'},scope).jobId).toBe(initial.jobId)
 const interrupted=ok('story.interrupt',{actId:id,scriptRevision:1,anchor:null,text:'这是主线的插话'},scope);await done(interrupted.jobId,scope)
 expect(JSON.stringify(inputs.at(-1).bundle.history)).not.toContain('只属于首页私聊');expect(JSON.stringify(inputs.at(-1).bundle)).toContain('这是主线的插话')
})
it('supports outline-led supplementary teaching without pretending the explanation was quoted from the upload',async()=>{
 const {ok,service,create,done}=setup(async(input:any)=>{if(input.operation==='verifyQuestions')return{output:{verdicts:[{index:0,status:'verified',reason:'线性电路是叠加定理的适用条件，可独立核对。',sourceRefs:[]}]},usage:{calls:1,tokens:10}};const output:any=lesson();output.questions=[{...output.questions[0],basis:'supplement',prompt:[{kind:'text',text:'叠加定理适用于哪类电路？',basis:'supplement',sourceRefs:[]}],choices:[{id:'linear',label:'线性电路'},{id:'nonlinear',label:'任意非线性电路'}],answer:{choiceIds:['linear']},sourceRefs:[],explanation:[{kind:'text',text:'叠加定理以线性为前提。',basis:'supplement',sourceRefs:[]}]}];output.blackboard=[{kind:'text',basis:'supplement',text:'叠加定理适用于线性电路。先保留一个独立源，其他独立源置零，再分别计算并取代数和。',sourceRefs:[]},{kind:'text',basis:'supplement',text:'电压源置零等效短路，电流源置零等效断路，受控源保留。',sourceRefs:[]}];return{output,usage:{calls:1,tokens:10}}})
 const source=service.options.sources.learningSource('course-one','chapter-one',1);vi.spyOn(service.options.sources,'learningSource').mockReturnValue({...source,chapterTitle:'第四章 电路定理',blocks:[{...source.blocks[0],text:'第四章 电路定理\n4.1 叠加定理\n4.2 戴维宁定理'}]})
 const scope=create(),entered=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),job=await done(entered.jobId,scope);expect(job.status).toBe('completed')
 const snapshot=ok('learning.get',{learningSessionId:job.resultRef},scope);expect(snapshot.lesson.blackboard[0]).toMatchObject({basis:'supplement',sourceRefs:[]});expect(snapshot.lesson.compositionVersion).toBe(2);expect(snapshot.questions).toHaveLength(1);expect(snapshot.questions[0]).toMatchObject({basis:'supplement',sourceRefs:[]})
})
it('keeps frozen answers private, marks hints server-side and does not duplicate attempts',async()=>{
 const {ok,create,done}=setup(),scope=create(),accepted=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),job=await done(accepted.jobId,scope)
 expect(job.status).toBe('completed');const session=ok('learning.get',{learningSessionId:job.resultRef},scope),question=session.questions[0]
 expect(question.answer).toBeUndefined();expect(JSON.stringify(session.questions)).not.toContain('识别伏特')
 const aid=ok('learning.hint',{learningSessionId:session.session.learningSessionId,questionId:question.questionId,level:'hint'},scope);expect(aid.aidEventId).toBeTruthy()
 const key=randomUUID(),payload={learningSessionId:session.session.learningSessionId,questionId:question.questionId,questionVersion:question.questionVersion,answer:{choiceIds:['v']},aidEventIds:[]}
 const one=ok('learning.submit',payload,scope,key),again=ok('learning.submit',payload,scope,key);expect(again.jobId).toBe(one.jobId);await done(one.jobId,scope)
 const final=ok('learning.get',{learningSessionId:session.session.learningSessionId},scope);expect(final.attempts).toHaveLength(1);expect(final.attempts[0]).toMatchObject({correct:true,assisted:true});expect(final.session.state).toBe('practiced')
})
it('restores the exact main anchor after merely visiting learning and retains editable workspace state',async()=>{
 const {ok,create,done}=setup(),scope=create(),prepared=ok('story.prepare',{actId:null,mode:'normal'},scope),job=await done(prepared.jobId,scope),buffer=ok('story.buffer.status',{actId:job.resultRef,scriptRevision:1},scope),page=ok('story.page.get',{actId:job.resultRef,scriptRevision:1,pageId:buffer.cursor.pageId},scope).page
 ok('story.present',{receipt:{receiptId:randomUUID(),actId:page.actId,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:3,channel:'story'}},scope)
 const entered=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),learning=await done(entered.jobId,scope),id=learning.resultRef
 ok('learning.resume',{learningSessionId:id,viewState:{panel:'practice',cursor:0,draft:'{"answer":"未提交"}',discussionDraft:'尚未发送的讨论',discussionAnchor:null,discussionOpen:true,panelOpen:true}},scope)
 const returned=ok('learning.return',{learningSessionId:id},scope);expect(returned.mainReturnAnchor).toMatchObject({pageId:page.pageId,revealedGraphemeCount:3})
 expect(ok('story.resume',{actId:page.actId,scriptRevision:1},scope).cursor).toMatchObject({pageId:page.pageId,revealedGraphemeCount:3})
 expect(ok('learning.get',{learningSessionId:id},scope).session).toMatchObject({panel:'practice',discussionDraft:'尚未发送的讨论',discussionOpen:true})
 ok('story.present',{receipt:{receiptId:randomUUID(),actId:page.actId,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:page.graphemeCount,channel:'story'}},scope)
 ok('story.advance',{actId:page.actId,scriptRevision:1,pageId:page.pageId,action:'next',revealedGraphemeCount:page.graphemeCount},scope)
 const next=ok('story.buffer.status',{actId:page.actId,scriptRevision:1},scope).cursor
 ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope)
 expect(ok('learning.get',{learningSessionId:id},scope).session.mainReturnAnchor).toMatchObject({pageId:next.pageId})
})
it('uses the latest reviewed judgment for mastery while retaining the original score',async()=>{
 const worker=async(input:any)=>{let output:any;if(input.operation==='composeAct')output=act();else if(input.operation==='composeLesson'){output=lesson();output.questions.push({...output.questions[0],type:'explanation',answer:{text:'解释电压单位'},choices:[],rubric:['依据资料解释']})}else if(input.operation==='verifyQuestions')output={verdicts:[0,1].map(index=>({index,status:'verified',reason:'来源明确。',sourceRefs:[source]}))};else output={correct:input.operation==='review'?false:true,score:input.operation==='review'?0:1,feedback:'按冻结依据复核。',uncertain:[],sourceRefs:[source]};return{output,usage:{calls:1,tokens:100}}}
 const {ok,create,done}=setup(worker),scope=create(),entered=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),id=(await done(entered.jobId,scope)).resultRef,snapshot=ok('learning.get',{learningSessionId:id},scope),[one,two]=snapshot.questions
 const answer=ok('learning.submit',{learningSessionId:id,questionId:one.questionId,questionVersion:1,answer:{choiceIds:['v']},aidEventIds:[]},scope);await done(answer.jobId,scope)
 const original=ok('learning.get',{learningSessionId:id},scope).attempts[0],review=ok('learning.review',{attemptId:original.attemptId,reason:'请重新核对。'},scope);await done(review.jobId,scope)
 const second=ok('learning.submit',{learningSessionId:id,questionId:two.questionId,questionVersion:1,answer:{text:'解释电压单位'},aidEventIds:[]},scope);await done(second.jobId,scope)
 const final=ok('learning.get',{learningSessionId:id},scope);expect(final.session.state).not.toBe('provisionallyMastered');expect(final.attempts.find((a:any)=>a.attemptId===original.attemptId).correct).toBe(true);expect(final.attempts.some((a:any)=>a.reviewOfAttemptId===original.attemptId&&a.correct===false)).toBe(true)
})
it('waits for a complete normal act and resumes interrupted playback only after five following pages',async()=>{
 let calls=0,release:((value:any)=>void)|null=null
 const worker=async()=>{calls++;if(calls===1)return{output:act(),usage:{calls:1,tokens:10}};if(calls===2)return{output:{...act(5),ending:'continue'},usage:{calls:1,tokens:10}};return new Promise<any>(r=>{release=r})}
 const {ok,create,done,service}=setup(worker),scope=create(),first=ok('story.prepare',{actId:null,mode:'normal'},scope),id=(await done(first.jobId,scope)).resultRef
 const interrupted=ok('story.interrupt',{actId:id,scriptRevision:1,anchor:null,text:'换一个场景'},scope)
 await vi.waitFor(()=>expect(calls).toBe(3));expect(ok('story.buffer.status',{actId:id,scriptRevision:2},scope)).toMatchObject({canPlay:false,validFollowingPages:4,complete:false})
 service.story.transaction(()=>service.acts.pause(scope));expect(ok('story.buffer.status',{actId:id,scriptRevision:2},scope).canPlay).toBe(false)
 release!({output:{...act(1),ending:'continue'},usage:{calls:1,tokens:10}})
 await vi.waitFor(()=>expect(calls).toBe(4));expect(ok('story.buffer.status',{actId:id,scriptRevision:2},scope)).toMatchObject({canPlay:true,validFollowingPages:5,complete:false})
 expect(ok('jobs.get',{jobId:interrupted.jobId},scope).status).toBe('running');ok('jobs.cancel',{jobId:interrupted.jobId},scope);release!({output:act(1),usage:{calls:1,tokens:10}});expect((await done(interrupted.jobId,scope)).status).toBe('cancelled')
})
it('retains a failed subjective attempt and retries grading without creating another submission',async()=>{
 let grades=0;const worker=async(input:any)=>{let output:any;if(input.operation==='composeLesson'){output=lesson();output.questions[0]={...output.questions[0],type:'explanation',choices:[],answer:{text:'解释电压'}}}else if(input.operation==='verifyQuestions')output={verdicts:[{index:0,status:'verified',reason:'来源明确。',sourceRefs:[source]}]};else{grades++;if(grades===1)throw new Error('AUTHENTICATION_FAILED');output={correct:true,score:1,feedback:'原作答通过核对。',uncertain:[],sourceRefs:[source]}}return{output,usage:{calls:1,tokens:10}}}
 const {ok,create,done}=setup(worker),scope=create(),entered=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),id=(await done(entered.jobId,scope)).resultRef,q=ok('learning.get',{learningSessionId:id},scope).questions[0],submitted=ok('learning.submit',{learningSessionId:id,questionId:q.questionId,questionVersion:1,answer:{text:'解释电压'},aidEventIds:[]},scope)
 expect((await done(submitted.jobId,scope)).status).toBe('failed');const before=ok('learning.get',{learningSessionId:id},scope);expect(before.attempts[0].status).toBe('failed')
 const retry=ok('jobs.retry',{jobId:submitted.jobId},scope);await done(retry.jobId,scope);const after=ok('learning.get',{learningSessionId:id},scope);expect(after.attempts).toHaveLength(1);expect(after.attempts[0]).toMatchObject({attemptId:before.attempts[0].attemptId,status:'graded',correct:true})
})
it('rejects forged nested source versions and incompatible submitted answer shapes',async()=>{
 const bad=setup(async(input:any)=>{const output:any=input.operation==='verifyQuestions'?{verdicts:[{index:0,status:'verified',reason:'来源明确。',sourceRefs:[source]}]}:lesson();if(input.operation==='composeLesson')output.questions[0].prompt[0].sourceRefs=[{...source,page:99}];return{output,usage:{calls:1,tokens:10}}}),scope=bad.create(),entered=bad.ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope)
 expect((await bad.done(entered.jobId,scope)).status).toBe('failed')
 const good=setup(),s=good.create(),job=good.ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},s),id=(await good.done(job.jobId,s)).resultRef,q=good.ok('learning.get',{learningSessionId:id},s).questions[0]
 expect(good.call('learning.submit',{learningSessionId:id,questionId:q.questionId,questionVersion:1,answer:{text:'伏特'},aidEventIds:[]},s)).toMatchObject({ok:false,error:{code:'INVALID_PAYLOAD'}})
 expect(good.ok('learning.get',{learningSessionId:id},s).attempts).toHaveLength(0)
})
it('invalidates an unplayed cached tail when the global user name changes',async()=>{
 const {ok,service,store,create,done}=setup(),scope=create(),job=ok('story.prepare',{actId:null,mode:'normal'},scope),actId=(await done(job.jobId,scope)).resultRef,before=store.save(scope.saveId)
 const request={protocolVersion:1 as const,requestId:randomUUID(),command:'profile.update',target:{kind:'profile' as const,id:null},saveId:null,branchId:null,expectedStateVersion:store.profile().stateVersion,idempotencyKey:randomUUID(),payload:{patch:{displayName:'新名字'}}},result=service.request(request)
 expect(result.ok).toBe(true);expect(store.save(scope.saveId).contextRevision).toBeGreaterThan(before.contextRevision)
 expect(service.acts.current(scope,actId)?.contextRevision).toBe(before.contextRevision)
 expect(service.acts.current(scope,actId)?.playbackState).toBe('paused')
 const changed=store.save(scope.saveId).contextRevision;expect(service.request({...request,requestId:randomUUID()}).ok).toBe(true);expect(store.save(scope.saveId).contextRevision).toBe(changed)
})
it('marks a disclosed answer as assisted only after the general discussion is actually presented',async()=>{
 const worker=async(input:any)=>({output:input.operation==='composeLesson'?lesson():input.operation==='verifyQuestions'?{verdicts:[{index:0,status:'verified',reason:'来源明确。',sourceRefs:[source]}]}:{blocks:[text('电压的单位是伏特。')],sourceRefs:[source]},usage:{calls:1,tokens:10}})
 const {ok,create,done}=setup(worker),scope=create(),entered=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),id=(await done(entered.jobId,scope)).resultRef,initial=ok('learning.get',{learningSessionId:id},scope),discussion=ok('learning.discuss',{learningSessionId:id,nodeId:initial.session.nodeId,text:'电压单位是什么？'},scope)
 await done(discussion.jobId,scope);const snapshot=ok('learning.get',{learningSessionId:id},scope),page=snapshot.discussionPages[0];expect(snapshot.aids).toHaveLength(0)
 ok('story.present',{receipt:{receiptId:randomUUID(),actId:id,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:page.graphemeCount,channel:'learning'}},scope)
 expect(ok('learning.get',{learningSessionId:id},scope).aids).toHaveLength(1)
 const question=snapshot.questions[0],submitted=ok('learning.submit',{learningSessionId:id,questionId:question.questionId,questionVersion:1,answer:{choiceIds:['v']},aidEventIds:[]},scope);await done(submitted.jobId,scope)
 expect(ok('learning.get',{learningSessionId:id},scope).attempts[0].assisted).toBe(true)
})
it('detects an answer spanning discussion pages without counting the unpresented tail',async()=>{
 const worker=async(input:any)=>({output:input.operation==='composeLesson'?lesson():input.operation==='verifyQuestions'?{verdicts:[{index:0,status:'verified',reason:'来源明确。',sourceRefs:[source]}]}:{blocks:[text('说明'.repeat(39)+'：伏特')],sourceRefs:[source]},usage:{calls:1,tokens:10}})
 const {ok,create,done}=setup(worker),scope=create(),entered=ok('learning.enter',{courseId:'course-one',chapterId:'chapter-one',chapterMapVersion:1},scope),id=(await done(entered.jobId,scope)).resultRef,initial=ok('learning.get',{learningSessionId:id},scope),discussion=ok('learning.discuss',{learningSessionId:id,nodeId:initial.session.nodeId,text:'电压单位是什么？'},scope)
 await done(discussion.jobId,scope);const pages=ok('learning.get',{learningSessionId:id},scope).discussionPages;expect(pages).toHaveLength(2)
 for(const [index,page] of pages.entries()){ok('story.present',{receipt:{receiptId:randomUUID(),actId:id,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:1,paginationVersion:1,revealedGraphemeCount:page.graphemeCount,channel:'learning'}},scope);expect(ok('learning.get',{learningSessionId:id},scope).aids).toHaveLength(index===0?0:1)}
})
