import {randomUUID} from 'node:crypto'
import type {ExperienceService} from './experience-service'
import type {ActRecord,ExperienceJob,ScriptPage} from '../../../shared/contracts/experience'
import type {ChatScope} from '../../../shared/contracts/home-chat'
import {bufferStatus,paginateNodes,validateActDraft} from './experience-validation'
import {contentHash} from '../../infrastructure/digest'
import {graphemeCount,graphemePrefix} from '../../../shared/graphemes'

export class ActOperations{
 constructor(private host:ExperienceService){}
 current(scope:ChatScope,id?:string|null){const actId=id??this.host.story.save(scope.saveId).activeActId;if(!actId)return null;return this.host.data.list('act',scope).filter(a=>a.actId===actId).sort((a,b)=>b.scriptRevision-a.scriptRevision)[0]??null}
 get(scope:ChatScope,id:string,revision:number){const act=this.current(scope,id);if(!act||act.scriptRevision!==revision||act.status==='superseded')throw new Error('CONTEXT_STALE');return act}
 cursor(act:ActRecord){const p=act.pages[act.cursor];return p?{actId:p.actId,nodeId:p.nodeId,pageId:p.pageId,scriptRevision:p.scriptRevision,paginationVersion:p.paginationVersion,revealedGraphemeCount:p.revealedGraphemeCount}:null}
 write(act:ActRecord){return this.host.data.put('act',`${act.actId}:${act.scriptRevision}`,act,act)}
 buffer(act:ActRecord){const status=bufferStatus(act.pages,act.cursor,act.ending==='actEnd',act.hasStarted?'continuing':act.mode);return{...status,actId:act.actId,scriptRevision:act.scriptRevision,contextRevision:act.contextRevision,title:act.title,number:act.number,mode:act.mode,hasStarted:!!act.hasStarted,status:act.status,playbackState:act.playbackState,cursor:this.cursor(act),jobId:act.jobId,jobStatus:this.host.data.get('job',act.jobId).status}}
 prepare(scope:ChatScope,id:string|null,mode:'normal'|'afterInterrupt',text?:string){
  const prior=this.current(scope,id)
  if(id&&!prior)throw new Error('NOT_FOUND')
  if(id&&id!==this.host.story.save(scope.saveId).activeActId)throw new Error('CONTEXT_STALE')
  if(prior&&prior.playbackState!=='ended'&&prior.contextRevision===this.host.story.save(scope.saveId).contextRevision&&text===undefined){const job=this.host.data.get('job',prior.jobId);if(['queued','running','completed'].includes(job.status))return this.host.accepted(job)}
  this.host.invalidate(scope)
  const turn=text!==undefined?this.host.home.repository.createTurn(scope,text,'story'):null
  if(!turn)this.host.bumpContext(scope)
  const revision=prior&&prior.playbackState!=='ended'?prior.scriptRevision+1:1,actId=revision>1?prior!.actId:randomUUID(),count=new Set(this.host.data.list('act',scope).map(a=>a.actId)).size
  if(prior){prior.status='superseded';this.write(prior)}
  const job=this.host.createJob(scope,'scriptDraft','act',{actId,scriptRevision:revision,mode,request:text??null,backgroundIds:[...this.host.options.backgroundIds]},turn?.turnId??null)
  const save=this.host.story.save(scope.saveId),number=revision>1?prior!.number:count===0?'0-0':count===1?'0-1':`${count-1}-1`
  const act:ActRecord={...scope,actId,title:prior?.title??'全新的起点',number,scriptRevision:revision,contextRevision:save.contextRevision,basedOnEventSeq:this.host.cutoff(),status:'drafting',ending:'continue',mode,jobId:job.jobId,pages:[],cursor:0,playbackState:mode==='afterInterrupt'?'rebuilding':'preparing',resumeState:null,createdAt:new Date().toISOString()}
  this.write(act);this.host.touch(scope,{activeActId:actId,activeScriptRevision:revision,learningSessionId:null,chapter:number,chapterName:act.title});return this.host.accepted(job)
 }
 command(command:string,p:any,scope:ChatScope):unknown{
  if(command==='story.prepare')return this.prepare(scope,p.actId,p.mode)
  if(command==='story.interrupt'){const act=this.get(scope,p.actId,p.scriptRevision);if(p.anchor)this.present(scope,{...p.anchor,receiptId:randomUUID(),channel:'story'});return this.prepare(scope,act.actId,'afterInterrupt',p.text)}
  if(command==='save.checkpoints')return{items:this.host.data.list('checkpoint',scope).map(c=>({checkpointId:c.checkpointId,label:c.label,kind:c.label==='自动保存'?'auto':c.label==='快速保存'?'quick':'manual',chapter:c.act?`${c.act.number} · ${c.act.title}`:'尚未进入主线',createdAt:c.createdAt,cursor:c.act?this.cursor(c.act):null})),nextCursor:null}
  if(command==='save.checkpoint'){const act=this.current(scope),checkpointId=randomUUID(),value={checkpointId,...scope,label:p.label,createdAt:new Date().toISOString(),act:act?structuredClone(act):null,learningSessionId:this.host.story.save(scope.saveId).learningSessionId??null};this.host.data.put('checkpoint',checkpointId,scope,value);return value}
  if(command==='save.replay'){const checkpoint=this.host.data.get('checkpoint',p.checkpointId);this.host.assertOwned(checkpoint,scope);const act=checkpoint.act,index=p.cursor?.pageIndex??0;if(!act)return{readOnly:true,page:null};const page=act.pages[index];if(!page||page.revealedGraphemeCount===0)throw new Error('FORBIDDEN');return{readOnly:true,page:{...page,blocks:this.visibleBlocks(page)},index,total:act.pages.filter(p=>p.revealedGraphemeCount>0).length}}
  const act=this.get(scope,p.actId,p.scriptRevision),page=act.pages[act.cursor]
  if(command==='story.buffer.status')return this.buffer(act)
  if(command==='story.page.get'){const selected=act.pages.find(page=>page.pageId===p.pageId);if(!selected)throw new Error('NOT_FOUND');return{page:selected,cursor:this.cursor(act),buffer:this.buffer(act)}}
  if(command==='story.resume'){
   if(this.host.story.save(scope.saveId).learningSessionId)throw new Error('FORBIDDEN')
   if(act.contextRevision!==this.host.story.save(scope.saveId).contextRevision)throw new Error('CONTEXT_STALE')
  if(!this.buffer(act).canPlay)throw new Error('BUFFER_NOT_READY')
   if(act.playbackState==='paused')act.playbackState=act.resumeState&& !['preparing','rebuilding','failed'].includes(act.resumeState)?act.resumeState:'revealing'
   else if(['preparing','rebuilding','failed'].includes(act.playbackState))act.playbackState=page.kind==='choice'&&page.revealedGraphemeCount===page.graphemeCount?'waitingInput':page.revealedGraphemeCount===page.graphemeCount?'pageComplete':'revealing'
   act.hasStarted=true;this.write(act);return{cursor:this.cursor(act),playbackState:act.playbackState,buffer:this.buffer(act)}
  }
  if(!page||page.pageId!==p.pageId)throw new Error('CONTEXT_STALE')
  if(command==='story.choose'){
   if(page.kind!=='choice'||page.revealedGraphemeCount!==page.graphemeCount||act.playbackState!=='waitingInput')throw new Error('INPUT_REQUIRED')
   const choice=page.choices.find(c=>c.id===p.choiceId);if(!choice)throw new Error('FORBIDDEN');return this.prepare(scope,act.actId,'afterInterrupt',choice.label)
  }
  if(command==='story.advance'){
   if(p.action==='revealAll')return{cursor:this.cursor(act),playbackState:act.playbackState,revealAll:true}
   if(page.revealedGraphemeCount<page.graphemeCount)throw new Error('BUFFER_NOT_READY')
   if(page.kind==='choice')throw new Error('INPUT_REQUIRED')
   if(act.cursor+1>=act.pages.length){if(act.ending!=='actEnd')throw new Error('BUFFER_NOT_READY');act.playbackState='ended'}
   else{act.cursor++;act.playbackState='revealing'}this.write(act);return{cursor:this.cursor(act),playbackState:act.playbackState,buffer:this.buffer(act)}
  }
  throw new Error('INVALID_PAYLOAD')
 }
 visibleBlocks(page:ScriptPage){let remaining=page.revealedGraphemeCount;return page.blocks.flatMap(block=>{const size=graphemeCount(block.kind==='text'?block.text:block.latex),count=Math.min(size,remaining);remaining-=count;if(!count)return[];return[block.kind==='text'?{...block,text:graphemePrefix(block.text,count)}:count===size?block:{kind:'text' as const,text:'[公式尚未完整呈现]',sourceRefs:[]}]})}
 present(scope:ChatScope,p:any){
  const act=this.get(scope,p.actId,p.scriptRevision),page=act.pages[act.cursor];if(!page||page.pageId!==p.pageId||page.nodeId!==p.nodeId||page.paginationVersion!==p.paginationVersion||p.revealedGraphemeCount>page.graphemeCount)throw new Error('CONTEXT_STALE')
  const key=p.receiptId,hash=contentHash(p);if(this.host.data.has('receipt',key)){const prior=this.host.data.get('receipt',key);if(prior.hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');return prior.result}
  if(p.revealedGraphemeCount>page.revealedGraphemeCount){page.revealedGraphemeCount=p.revealedGraphemeCount;const text=this.visibleBlocks(page).map(b=>b.kind==='text'?b.text:`\\[${b.latex}\\]`).join('\n'),name=page.speaker==='partner'?this.host.story.save(scope.saveId).characterSnapshot.content.name:page.speaker==='user'?`剧情 · ${this.host.story.profile().displayName}`:'旁白';this.host.home.repository.shared(scope,page.pageId,name,text,'assistant');this.host.touch(scope,{lastLine:text});if(page.revealedGraphemeCount===page.graphemeCount)act.playbackState=page.kind==='choice'?'waitingInput':'pageComplete';this.write(act)}
  const result={acceptedReceiptId:key,cursor:this.cursor(act),stateVersion:this.host.story.save(scope.saveId).stateVersion};this.host.data.put('receipt',key,scope,{hash,result});return result
 }
 async execute(job:ExperienceJob,signal:AbortSignal){
  let act=this.get(job,job.input.actId as string,job.input.scriptRevision as number)
  while(!signal.aborted){
   const result=await this.host.invoke(job,'composeAct',{...job.input,validatedDraftPrefix:act.pages.map(({blocks,speaker,kind})=>({blocks,speaker,kind})),instruction:'只续写尚未生成的尾部，自然完成当前一幕或到明确的用户交互点。不要为规避缺失内容制造短结尾；专有名词沿用原始汉字，不做拼音回译。'},signal)
   const save=this.host.story.save(job.saveId),draft=validateActDraft(result,new Set(save.characterSnapshot.content.poses.map(p=>p.id)),this.host.options.backgroundIds),nodes=paginateNodes(draft.nodes)
   await this.host.validateLayout(job,nodes.flatMap(n=>n.blocks),'story',signal)
   this.host.guard(job,signal)
   this.host.story.transaction(()=>{
    act=this.get(job,act.actId,act.scriptRevision)
    const offset=act.pages.length,newPages:ScriptPage[]=nodes.map((node,i)=>{const body={...node,actId:act.actId,scriptRevision:act.scriptRevision,paginationVersion:1,pageId:randomUUID(),nodeId:randomUUID(),index:offset+i,graphemeCount:node.blocks.reduce((n,b)=>n+graphemeCount(b.kind==='text'?b.text:b.latex),0),ending:i===nodes.length-1&&draft.ending!=='continue'?draft.ending:null};return{...body,contentHash:contentHash(body),revealedGraphemeCount:0}})
    act.pages.push(...newPages);act.title=draft.title;act.ending=draft.ending;act.status=draft.ending==='continue'?'validated':'ready';this.write(act);this.host.touch(job,{chapterName:act.title});this.host.emit(job,'artifact.validated',{actId:act.actId,scriptRevision:act.scriptRevision,pages:newPages.length})
   })
   if(draft.ending!=='continue'){
    if(act.mode==='afterInterrupt'&&!this.buffer(act).canPlay&&act.playbackState==='rebuilding')throw new Error('BUFFER_NOT_READY')
    return act.actId
   }
   job=this.host.data.get('job',job.jobId)
  }throw new Error('CANCELLED')
 }
 pause(scope:ChatScope){const act=this.current(scope);if(act&&!['ended','failed','paused'].includes(act.playbackState)){act.resumeState=act.playbackState;act.playbackState='paused';this.write(act)}return act?this.cursor(act):null}
}
