import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {StoryRequest,StoryResponse,StoryRecord} from '../../../shared/contracts/story'
import type {ChatScope} from '../../../shared/contracts/home-chat'
import type {CourseSource,ExperienceContext,ExperienceJob} from '../../../shared/contracts/experience'
import {storyRequestSchema} from '../../../shared/schemas/story'
import {experienceCommandSchemas,experienceReads} from '../../../shared/schemas/experience'
import {HomeChatService} from './home-service'
import {StoryStore} from './store'
import {ExperienceStore} from './experience-store'
import {ActOperations} from './experience-acts'
import {LearningOperations} from '../learning/operations'
import {modelGate} from '../../runtime/model-gate'
import {contentHash} from '../../infrastructure/digest'
import type {ProviderConfig} from '../../infrastructure/providers/deepseek'
import type {LayoutRequest,LayoutReport} from '../../../shared/contracts/layout'
import type {RichBlock} from '../../../shared/contracts/experience'

export interface ExperienceWorkerInput{config:ProviderConfig;operation:string;bundle:ExperienceContext;sessionId:string;limits:{maxCalls:number;maxTokens:number}}
export interface ExperienceOptions{home:HomeChatService;provider:{get:()=>ProviderConfig;summary:()=>{configured:boolean};intentHash:(text:string)=>string};sources:{learningSource:(courseId:string,chapterId:string,version:number)=>CourseSource};backgroundIds:Set<string>;layout?:(request:LayoutRequest,signal:AbortSignal)=>Promise<LayoutReport>;validateLayout?:(blocks:RichBlock[],mode:'story'|'learning',signal:AbortSignal)=>Promise<LayoutReport[]>;worker:(input:ExperienceWorkerInput,signal:AbortSignal,onProgress?:(value:{calls:number;tokens:number;reason?:string})=>void,onTool?:(payload:unknown)=>Promise<unknown>)=>Promise<{output:unknown;usage:{calls:number;tokens:number}}>}
const terminal=(j:ExperienceJob)=>['completed','failed','cancelled','superseded'].includes(j.status)
export class ExperienceService{
 readonly data:ExperienceStore;readonly home:HomeChatService;readonly acts:ActOperations;readonly learning:LearningOperations
 private epoch=randomUUID();private controllers=new Map<string,AbortController>();private disposed=false;private pending:ExperienceJob[]=[]
 constructor(readonly story:StoryStore,readonly options:ExperienceOptions){
  this.home=options.home;this.data=new ExperienceStore(story);this.acts=new ActOperations(this);this.learning=new LearningOperations(this)
  for(const job of this.data.list('job'))if(!terminal(job))story.transaction(()=>this.data.job(job.jobId,{status:'failed',stage:null,error:{code:'RUNTIME_UNAVAILABLE',message:'应用已重启；有效内容已保留，请明确重试。'}}))
 }
 dispose(){this.disposed=true;for(const c of this.controllers.values())c.abort();this.controllers.clear()}
 providerChanged(){for(const job of this.data.list('job'))if(!terminal(job))this.cancel(job)}
 jobVersion(id:string){return this.data.has('job',id)?this.data.get('job',id).stateVersion:0}
 private fingerprint(){return this.options.provider.intentHash(JSON.stringify(this.options.provider.get()))}
 assertOwned(value:ChatScope,scope:ChatScope){if(value.saveId!==scope.saveId||value.branchId!==scope.branchId)throw new Error('FORBIDDEN')}
 touch(scope:ChatScope,patch:Partial<StoryRecord>={}){const save=this.story.save(scope.saveId);this.story.writeSave({...save,...patch,stateVersion:save.stateVersion+1,updatedAt:new Date().toISOString()})}
 bumpContext(scope:ChatScope){this.touch(scope,{contextRevision:this.story.save(scope.saveId).contextRevision+1})}
 emit(scope:ChatScope,type:string,payload:unknown){return this.home.repository.emit(scope,type,payload)}
 cutoff(){return Number((this.story.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM home_events').get() as {seq:number}).seq)}
 accepted(job:ExperienceJob){return{jobId:job.jobId,turnId:job.turnId,status:'queued',pollAfterMs:250}}
 invalidate(scope:ChatScope){
  for(const job of this.data.list('job',scope))if(!terminal(job)&&!['grade','review'].includes(job.operation))this.data.job(job.jobId,{status:'superseded',stage:null,cancelRequestedAt:new Date().toISOString()})
 }
 createJob(scope:ChatScope,purpose:ExperienceJob['purpose'],operation:ExperienceJob['operation'],input:Record<string,unknown>,turnId:string|null,prior?:ExperienceJob){
  if(!this.options.provider.summary().configured)throw new Error('MODEL_NOT_CONFIGURED')
  if(prior&&prior.attempt>=3)throw new Error('INPUT_REQUIRED')
  const save=this.story.save(scope.saveId),job:ExperienceJob={...scope,jobId:randomUUID(),taskId:randomUUID(),taskRevision:1,sessionId:randomUUID(),runtimeEpoch:this.epoch,turnId,contextRevision:save.contextRevision,profileVersion:this.story.profile().stateVersion,providerFingerprint:this.fingerprint(),purpose,operation,status:'queued',stage:'collecting',stateVersion:0,cancelRequestedAt:null,createdAt:new Date().toISOString(),resultRef:null,error:null,attempt:(prior?.attempt??0)+1,retryOfJobId:prior?.jobId??null,input,budget:prior?{...prior.budget}:{calls:0,tokens:0,maxCalls:12,maxTokens:purpose==='learningCompose'?128000:48000}}
  this.data.put('job',job.jobId,scope,job);this.emit(scope,'task.queued',{jobId:job.jobId,taskId:job.taskId,purpose});this.pending.push(job);return job
 }
 private publicJob(job:ExperienceJob){const {input:_,providerFingerprint:__,sessionId:___,...safe}=job;return safe}
 private cancel(job:ExperienceJob){if(terminal(job))return;this.story.transaction(()=>this.data.job(job.jobId,{cancelRequestedAt:new Date().toISOString(),...job.status==='queued'?{status:'cancelled' as const,stage:null}:{}}));this.controllers.get(job.jobId)?.abort()}
 guard(job:ExperienceJob,signal:AbortSignal){
  signal.throwIfAborted();const current=this.data.get('job',job.jobId);if(this.disposed||terminal(current)||current.cancelRequestedAt)throw new Error('CANCELLED')
  this.home.repository.assertScope(job,true)
  if(this.story.profile().stateVersion!==job.profileVersion||this.fingerprint()!==job.providerFingerprint||!['grade','review'].includes(job.operation)&&this.story.save(job.saveId).contextRevision!==job.contextRevision)throw new Error('CONTEXT_STALE')
 }
 async validateLayout(job:ExperienceJob,blocks:RichBlock[],mode:'story'|'learning',signal:AbortSignal){this.guard(job,signal);if(this.options.validateLayout){const reports=await this.options.validateLayout(blocks,mode,signal);this.guard(job,signal);this.story.transaction(()=>this.emit(job,'layout.validated',{jobId:job.jobId,viewports:reports.map(r=>r.viewport),fontReady:reports.every(r=>r.fontReady)}))}}
 async invoke(job:ExperienceJob,operation:string,task:Record<string,unknown>,signal:AbortSignal,source:CourseSource|null=null){
  this.guard(job,signal);const current=this.data.get('job',job.jobId),remaining=current.budget.maxCalls-current.budget.calls;if(remaining<=0||current.budget.tokens>=current.budget.maxTokens)throw new Error('BUDGET_EXCEEDED')
  const save=this.story.save(job.saveId),{sprites:_,...profile}=save.characterSnapshot.content,isScript=job.purpose==='scriptDraft'&&operation==='composeAct'
  const currentInputEventId=job.turnId?this.home.repository.turn(job.turnId).input.id:typeof job.input.inputEventId==='string'?job.input.inputEventId:null,history=isScript?this.home.repository.history(job,null,50,'story').filter(m=>m.id!==currentInputEventId):[],user=this.story.profile(),safeProfile=isScript?profile:{...profile,personality:'',background:'',relationship:'',events:'',immutable:'',sourceWork:'',partnerIdentity:'',userIdentity:'',initiative:'',address:'',knowledge:'仅依据当前授权资料的解答服务。'}
  const bundleBody:Omit<ExperienceContext,'contentHash'>={bundleId:randomUUID(),purpose:operation==='verifyQuestions'||['grade','review','discussion'].includes(operation)?'research':job.purpose,...{saveId:job.saveId,branchId:job.branchId},actorId:save.characterTemplateId,contextRevision:job.contextRevision,visibleEventCutoff:this.cutoff(),sourceEventIds:[...new Set([...history.flatMap(m=>m.sourceEventIds),...currentInputEventId?[currentInputEventId]:[]])],characterCoreVersion:save.characterTemplateVersion,growthVersion:0,memoryProjectionVersion:job.contextRevision,suppressionVersion:0,documentVersionIds:source?.documentVersionIds??[],allowedArtifactIds:[],currentInputEventId,summaryRefs:[],profile:safeProfile,user:isScript?user:{...user,displayName:'我',preferredAddress:''},history,systemTime:new Date().toISOString(),task,source}
  const bundle={...bundleBody,contentHash:contentHash(bundleBody)},taskId=randomUUID();this.story.transaction(()=>{this.data.put('bundle',`${job.jobId}:${taskId}`,job,bundle);this.data.job(job.jobId,{stage:'generating',taskId});this.emit(job,'task.started',{jobId:job.jobId,taskId,purpose:bundle.purpose})})
  const progress=(value:{calls:number;tokens:number;reason?:string})=>{if(this.disposed||!this.data.has('job',job.jobId))return;this.story.transaction(()=>{const latest=this.data.get('job',job.jobId);this.data.job(job.jobId,{budget:{...latest.budget,calls:Math.max(latest.budget.calls,current.budget.calls+value.calls),tokens:Math.max(latest.budget.tokens,current.budget.tokens+value.tokens),...value.reason?{reason:value.reason}:{}}})})}
  let previewCalls=0
  const onTool=async(payload:unknown)=>{this.guard(job,signal);if(!this.options.layout||++previewCalls>4)throw new Error('FORBIDDEN');const result=await this.options.layout(payload as LayoutRequest,signal);this.guard(job,signal);return result}
  const result=await modelGate.run(signal,()=>this.options.worker({config:this.options.provider.get(),operation,bundle,sessionId:randomUUID(),limits:{maxCalls:remaining,maxTokens:current.budget.maxTokens-current.budget.tokens}},signal,progress,onTool),isScript?2:1)
  this.guard(job,signal)
  progress(result.usage);this.story.transaction(()=>this.data.job(job.jobId,{stage:'validating'}))
  return result.output
 }
 request(raw:unknown):StoryResponse{
  const candidate=raw as any,name=String(candidate?.command??''),experienceJob=name.startsWith('jobs.')&&this.data.has('job',String(candidate?.payload?.jobId??'')),storyReceipt=name==='story.present'&&['story','learning'].includes(candidate?.payload?.receipt?.channel),storySend=name==='story.send'&&candidate?.payload?.channel==='story'
  if(!Object.hasOwn(experienceCommandSchemas,name)&&!experienceJob&&!storyReceipt&&!storySend){
   const priorProfileVersion=this.story.profile().stateVersion,response=this.home.request(raw)
   if(response.ok&&name==='save.get'){const record=response.data as StoryRecord;response.data={...record,learningProgress:this.learning.progress({saveId:record.id,branchId:record.branchId})}}
   if(response.ok&&['save.activate','template.select','save.delete','profile.update'].includes(name)&&(name!=='profile.update'||this.story.profile().stateVersion!==priorProfileVersion)){
    const selected=this.story.selection();for(const job of this.data.list('job'))if(!terminal(job)&&(name==='profile.update'||selected.kind!=='save'||job.saveId!==selected.saveId||job.branchId!==selected.branchId))this.cancel(job)
    for(const [id,c] of this.controllers)if(!this.data.has('job',id))c.abort()
    if(name==='profile.update')this.story.transaction(()=>{const scopes=new Map(this.data.list('act').map(act=>[`${act.saveId}:${act.branchId}`,{saveId:act.saveId,branchId:act.branchId}]));for(const scope of scopes.values()){this.bumpContext(scope);this.acts.pause(scope)}})
   }
   return response
  }
  let request:StoryRequest|undefined,version:number|null=null;this.pending=[]
  try{
   request=storyRequestSchema.parse(raw);if(!request.saveId||!request.branchId)throw new Error('FORBIDDEN');const scope={saveId:request.saveId,branchId:request.branchId},read=experienceReads.has(name)||name==='jobs.get'
   const save=this.home.repository.assertScope(scope,!read),job=experienceJob?this.data.get('job',candidate.payload.jobId):null;if(job)this.assertOwned(job,scope)
   if(!read&&name.startsWith('story.')&&save.learningSessionId&&!(storyReceipt&&candidate.payload.receipt.channel==='learning'))throw new Error('FORBIDDEN')
   if(request.target.kind!==(experienceJob?'job':'save')||request.target.id!==(job?.jobId??scope.saveId)||read&&request.idempotencyKey!==null||!read&&!request.idempotencyKey)throw new Error('FORBIDDEN')
   version=job?.stateVersion??save.stateVersion
   let payload:any
   if(experienceJob)payload=z.object({jobId:z.string().min(1).max(160)}).strict().parse(request.payload)
   else if(storyReceipt)payload=z.object({receipt:z.object({receiptId:z.string().min(1).max(160),actId:z.string().min(1).max(160),nodeId:z.string().min(1).max(160),pageId:z.string().min(1).max(160),scriptRevision:z.number().int().positive(),paginationVersion:z.number().int().positive(),revealedGraphemeCount:z.number().int().nonnegative(),channel:z.enum(['story','learning'])}).strict()}).strict().parse(request.payload)
   else if(storySend)payload=z.object({channel:z.literal('story'),text:z.string().min(1).max(16000),anchor:z.unknown().nullable()}).strict().parse(request.payload)
   else payload=experienceCommandSchemas[name as keyof typeof experienceCommandSchemas].parse(request.payload)
   const hash=contentHash({name,scope,target:request.target,payload}),previous=!read?this.story.db.prepare('SELECT hash,result FROM story_commands WHERE key=?').get(request.idempotencyKey!) as {hash:string;result:string}|undefined:null
   if(previous){if(hash!==previous.hash)throw new Error('IDEMPOTENCY_CONFLICT');const prior=JSON.parse(previous.result);return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:prior.stateVersion,data:prior.data}}
   if(!read&&request.expectedStateVersion!==version&&!(name==='jobs.cancel'&&job&&terminal(job)))throw new Error('STALE_STATE')
   const execute=()=>{
    let value:unknown
    if(experienceJob){
     if(name==='jobs.get')value=this.publicJob(job!)
     else if(name==='jobs.cancel'){if(!terminal(job!)&&!job!.cancelRequestedAt)this.data.job(job!.jobId,{cancelRequestedAt:new Date().toISOString(),...job!.status==='queued'?{status:'cancelled' as const,stage:null}:{}});value={jobId:job!.jobId,cancelAccepted:!terminal(job!),alreadyTerminal:terminal(job!),status:this.data.get('job',job!.jobId).status}}
     else if(name==='jobs.retry'){
      if(!['failed','cancelled'].includes(job!.status)||!['grade','review'].includes(job!.operation)&&(this.story.profile().stateVersion!==job!.profileVersion||this.story.save(scope.saveId).contextRevision!==job!.contextRevision))throw new Error('CONTEXT_STALE')
      const next=this.createJob(scope,job!.purpose,job!.operation,job!.input,job!.turnId,job!);this.learning.retryReference(job!,next);if(job!.operation==='act'){const act=this.acts.current(scope,job!.input.actId as string);if(!act)throw new Error('NOT_FOUND');act.jobId=next.jobId;act.playbackState=act.mode==='normal'?'preparing':'rebuilding';this.acts.write(act)}value=this.accepted(next)
     }else throw new Error('INVALID_PAYLOAD')
    }else if(storyReceipt)value=payload.receipt.channel==='story'?this.acts.present(scope,payload.receipt):this.learning.present(scope,payload.receipt)
    else if(storySend){const act=this.acts.current(scope);if(payload.anchor&&act)this.acts.present(scope,{...payload.anchor,receiptId:randomUUID(),channel:'story'});value=this.acts.prepare(scope,act?.actId??null,act?'afterInterrupt':'normal',payload.text)}
    else if(name.startsWith('learning.'))value=this.learning.command(name,payload,scope)
    else value=this.acts.command(name,payload,scope)
    return value
   }
   const data=read?execute():this.story.transaction(()=>{const value=execute();if(!experienceJob)this.touch(scope);const stateVersion=experienceJob?this.data.get('job',job!.jobId).stateVersion:this.story.save(scope.saveId).stateVersion;this.story.db.prepare('INSERT INTO story_commands VALUES(?,?,?)').run(request!.idempotencyKey!,hash,JSON.stringify({stateVersion,data:value}));return value})
   version=experienceJob?this.data.get('job',job!.jobId).stateVersion:this.story.save(scope.saveId).stateVersion
   for(const [id,c] of this.controllers){const j=this.data.get('job',id);if(terminal(j)||j.cancelRequestedAt)c.abort()}
   for(const next of this.pending)queueMicrotask(()=>void this.run(next))
   return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:version,data}
  }catch(error){this.pending=[];const code=error instanceof z.ZodError?'INVALID_PAYLOAD':error instanceof Error?error.message:'RUNTIME_UNAVAILABLE',messages:Record<string,string>={MODEL_NOT_CONFIGURED:'请先在设置中配置模型。',INVALID_PAYLOAD:'请求参数无效。',FORBIDDEN:'当前存档不允许此操作。',NOT_FOUND:'内容已不存在。',CONTEXT_STALE:'内容或上下文已变化，请刷新后重试。',STALE_STATE:'状态已变化，请重试。',IDEMPOTENCY_CONFLICT:'操作标识与原请求不一致。',BUFFER_NOT_READY:'内容尚未准备好或当前页尚未完整呈现。',INPUT_REQUIRED:'需要补充资料、选择或调整生成预算。'};return{protocolVersion:1,requestId:request?.requestId??'',ok:false,stateVersion:version,error:{code:messages[code]?code:'RUNTIME_UNAVAILABLE',message:messages[code]??'任务暂时无法执行，已有内容与输入保留。',retryable:false,detailsRef:null}}}
 }
 private async run(job:ExperienceJob){
  if(this.disposed)return;const controller=new AbortController();this.controllers.set(job.jobId,controller)
  try{this.guard(job,controller.signal);this.story.transaction(()=>this.data.job(job.jobId,{status:'running',stage:'collecting'}));const ref=job.operation==='act'?await this.acts.execute(job,controller.signal):await this.learning.execute(job,controller.signal);this.guard(job,controller.signal);this.story.transaction(()=>{this.data.job(job.jobId,{status:'completed',stage:null,resultRef:ref});this.emit(job,'task.completed',{jobId:job.jobId,resultRef:ref})})}
  catch(error){if(!this.disposed&&this.data.has('job',job.jobId)){const current=this.data.get('job',job.jobId);if(!terminal(current))this.story.transaction(()=>{const raw=error instanceof Error?error.message:'RUNTIME_UNAVAILABLE',cancelled=controller.signal.aborted||!!current.cancelRequestedAt;this.learning.fail(job,cancelled);this.data.job(job.jobId,{status:cancelled?'cancelled':raw==='CONTEXT_STALE'?'superseded':'failed',stage:null,error:cancelled?null:{code:raw==='BUDGET_EXCEEDED'?'INPUT_REQUIRED':raw.startsWith('INVALID_')?'INVALID_MODEL_OUTPUT':raw==='AUTHENTICATION_FAILED'?'AUTHENTICATION_FAILED':'RUNTIME_UNAVAILABLE',message:raw==='BUDGET_EXCEEDED'?'已达到本次生成预算，已验证内容保留；可调整方案后继续。':raw==='AUTHENTICATION_FAILED'?'模型认证失败，请检查 API Key。':'生成未完成或未通过校验，已有有效内容保留，可明确重试。'}})})}}
  finally{this.controllers.delete(job.jobId)}
 }
}
