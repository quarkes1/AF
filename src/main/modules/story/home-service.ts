import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {modelGate} from '../../runtime/model-gate'
import type {ProviderConfig} from '../../infrastructure/providers/deepseek'
import type {StoryStore} from './store'
import type {StoryRequest,StoryResponse} from '../../../shared/contracts/story'
import type {CharacterContextBundle,ChatScope,HomeJob,HomeJobSummary,HomeState} from '../../../shared/contracts/home-chat'
import {storyRequestSchema} from '../../../shared/schemas/story'
import {homeCommandSchemas,homeReads} from '../../../shared/schemas/home-chat'
import {HomeRepository,contentHash} from './home-repository'

export interface CharacterWorkerInput{config:ProviderConfig;scope:{jobId:string;taskId:string;taskRevision:number;runtimeEpoch:string;sessionId:string;saveId:string;branchId:string;purpose:'characterDialogue'};bundle:CharacterContextBundle}
export interface CharacterWorkerResult{reply:unknown;usage:{calls:number;tokens:number}}
interface Options{provider:{summary:()=>{configured:boolean};get:()=>ProviderConfig;intentHash:(text:string)=>string};worker:(input:CharacterWorkerInput,signal:AbortSignal)=>Promise<CharacterWorkerResult>}
const terminal=(job:HomeJob)=>['completed','failed','cancelled','superseded'].includes(job.status)
const publicJob=(job:HomeJob):HomeJobSummary=>{const {jobId,turnId,status,stage,stateVersion,attempt,createdAt,cancelRequestedAt,error,resultRef}=job;return{jobId,turnId,status,stage,stateVersion,attempt,createdAt,cancelRequestedAt,error,resultRef}}

export class HomeChatService{
 readonly repository:HomeRepository
 private epoch=randomUUID()
 private disposed=false
 private controllers=new Map<string,AbortController>()
 constructor(readonly store:StoryStore,private options:Options){
  this.repository=new HomeRepository(store)
  for(const job of this.repository.jobs())if(!terminal(job))store.transaction(()=>this.repository.changeJob(job.jobId,{status:'failed',stage:null,error:{code:'RUNTIME_UNAVAILABLE',message:'应用已重启，回复生成已中断，可明确重试。'}}))
 }
 dispose(){this.disposed=true;for(const controller of this.controllers.values())controller.abort();this.controllers.clear()}
 cancelForForeground(scope:ChatScope){for(const job of this.repository.jobs(scope))if(!terminal(job))this.cancel(job.jobId)}
 providerChanged(){for(const job of this.repository.jobs())if(!terminal(job))this.cancel(job.jobId)}
 private fingerprint(){return this.options.provider.intentHash(JSON.stringify(this.options.provider.get()))}
 private cancel(id:string){const job=this.repository.job(id);if(terminal(job))return;this.store.transaction(()=>this.repository.changeJob(id,{cancelRequestedAt:new Date().toISOString(),...job.status==='queued'?{status:'cancelled' as const,stage:null}:{}}));this.controllers.get(id)?.abort()}
 private cancelOutsideSelection(){const selection=this.store.selection();for(const job of this.repository.jobs())if(!terminal(job)&&(selection.kind!=='save'||selection.saveId!==job.saveId||selection.branchId!==job.branchId))this.cancel(job.jobId);for(const [id,controller] of this.controllers)try{this.repository.job(id)}catch{controller.abort()}}
 private accepted(job:HomeJob){return{jobId:job.jobId,turnId:job.turnId,status:'queued',pollAfterMs:250}}
 request(raw:unknown):StoryResponse{
  const name=raw&&typeof raw==='object'&&'command'in raw?String(raw.command):''
  if(!Object.hasOwn(homeCommandSchemas,name)){
   const priorProfileVersion=this.store.profile().stateVersion,response=this.store.request(raw)
   if(response.ok){if(['save.activate','template.select','save.delete'].includes(name))this.cancelOutsideSelection();if(name==='profile.update'&&this.store.profile().stateVersion!==priorProfileVersion){for(const job of this.repository.jobs())if(!terminal(job))this.cancel(job.jobId);this.store.transaction(()=>this.store.db.prepare("UPDATE home_replies SET state='sealed' WHERE state='ready'").run())}}
   return response
  }
  let request:StoryRequest|undefined,stateVersion:number|null=null
  const schedule:HomeJob[]=[],abort:string[]=[]
  try{
   request=storyRequestSchema.parse(raw);const command=request.command as keyof typeof homeCommandSchemas,p=homeCommandSchemas[command].parse(request.payload) as any,read=homeReads.has(command),jobCommand=command.startsWith('jobs.')
   if(!request.saveId||!request.branchId||request.target.kind!==(jobCommand?'job':'save')||request.target.id!==(jobCommand?p.jobId:request.saveId))throw new Error('FORBIDDEN')
   const scope={saveId:request.saveId,branchId:request.branchId},save=this.repository.assertScope(scope,!read),job=jobCommand?this.repository.job(p.jobId,scope):null
   if(read?request.idempotencyKey!==null:!request.idempotencyKey)throw new Error('INVALID_PAYLOAD')
   stateVersion=job?job.stateVersion:save.stateVersion
   const state=():HomeState=>{const latest=this.repository.latestTurn(scope),current=this.repository.jobs(scope).find(j=>j.turnId===latest?.turnId)??null;return{stateVersion:this.store.save(scope.saveId).stateVersion,contextRevision:(this.store.save(scope.saveId).homeContextRevision??this.store.save(scope.saveId).contextRevision),history:this.repository.history(scope,null,40,'home'),job:current?publicJob(current):null,reply:this.repository.reply(scope),acceptedText:latest?.input.text??null,providerConfigured:this.options.provider.summary().configured}}
   if(read){const data=command==='home.get'?state():command==='jobs.get'?publicJob(job!):{items:this.repository.history(scope,p.beforeEventSeq??(p.cursor?Number(p.cursor):null),p.limit??40,p.channel??'story')};return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion,data}}
   const hash=contentHash({command,target:request.target,scope,payload:p}),prior=this.store.db.prepare('SELECT hash,result FROM story_commands WHERE key=?').get(request.idempotencyKey!) as {hash:string;result:string}|undefined
   if(prior){if(prior.hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');const receipt=JSON.parse(prior.result);return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:receipt.stateVersion,data:receipt.data}}
   if(request.expectedStateVersion!==stateVersion&&!(command==='jobs.cancel'&&terminal(job!)))throw new Error('STALE_STATE')
   const result=this.store.transaction(()=>{
    let data:unknown
    switch(command){
     case 'story.send':{
      if(!this.options.provider.summary().configured)throw new Error('MODEL_NOT_CONFIGURED')
      this.repository.anchor(scope,p.anchor)
      for(const old of this.repository.jobs(scope))if(!terminal(old)){this.repository.changeJob(old.jobId,{status:'superseded',stage:null,cancelRequestedAt:new Date().toISOString()});abort.push(old.jobId)}
      this.repository.seal(scope);const turn=this.repository.createTurn(scope,p.text),next=this.repository.createJob(turn,this.epoch,this.fingerprint());this.repository.bundle(next);schedule.push(next);data=this.accepted(next);break
     }
     case 'story.present':data=this.repository.present(scope,p.receipt);break
     case 'home.stop':{
      this.repository.stop(scope,p.anchor)
      const current=this.repository.jobs(scope).find(j=>!terminal(j));if(current){this.repository.changeJob(current.jobId,{cancelRequestedAt:new Date().toISOString(),...current.status==='queued'?{status:'cancelled' as const,stage:null}:{}});abort.push(current.jobId)}data={stopped:true};break
     }
     case 'jobs.cancel':{
      if(terminal(job!))data={jobId:job!.jobId,cancelAccepted:false,alreadyTerminal:true,status:job!.status}
      else{const next=this.repository.changeJob(job!.jobId,{cancelRequestedAt:new Date().toISOString(),...job!.status==='queued'?{status:'cancelled' as const,stage:null}:{}});abort.push(next.jobId);data={jobId:next.jobId,cancelAccepted:true,alreadyTerminal:false,status:next.status}}break
     }
     case 'jobs.retry':{
      if(!['failed','cancelled'].includes(job!.status))throw new Error('INVALID_PAYLOAD')
      if(!this.options.provider.summary().configured)throw new Error('MODEL_NOT_CONFIGURED')
      if(this.repository.latestTurn(scope)?.turnId!==job!.turnId||(save.homeContextRevision??save.contextRevision)!==job!.contextRevision||this.store.profile().stateVersion!==job!.profileVersion)throw new Error('CONTEXT_STALE')
      const next=this.repository.createJob(this.repository.turn(job!.turnId),this.epoch,this.fingerprint());this.repository.bundle(next);schedule.push(next);data=this.accepted(next);break
     }
    }
    const version=jobCommand?this.repository.job(p.jobId).stateVersion:this.store.save(scope.saveId).stateVersion,receipt={receiptVersion:2,stateVersion:version,data}
    this.store.db.prepare('INSERT INTO story_commands VALUES(?,?,?)').run(request!.idempotencyKey!,hash,JSON.stringify(receipt));return receipt
   })
   for(const id of abort)this.controllers.get(id)?.abort()
   for(const job of schedule)queueMicrotask(()=>void this.run(job))
   return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:result.stateVersion,data:result.data}
  }catch(error){const failure=this.failure(error instanceof z.ZodError?new Error('INVALID_PAYLOAD'):error);return{protocolVersion:1,requestId:request?.requestId??'',ok:false,stateVersion,error:{...failure,retryable:['RUNTIME_UNAVAILABLE','RUNTIME_TIMEOUT'].includes(failure.code),detailsRef:null}}}
 }
 private async run(accepted:HomeJob){
  if(this.disposed)return
  const controller=new AbortController();this.controllers.set(accepted.jobId,controller)
  try{
   const current=this.repository.job(accepted.jobId);if(terminal(current)||current.cancelRequestedAt)return
   this.store.transaction(()=>{this.repository.changeJob(current.jobId,{status:'running',stage:'generating'});this.repository.emit(current,'task.started',{jobId:current.jobId,taskId:current.taskId,taskRevision:current.taskRevision})})
   const row=this.store.db.prepare('SELECT data FROM home_bundles WHERE job_id=?').get(current.jobId) as {data:string},bundle=JSON.parse(row.data) as CharacterContextBundle
   const result=await modelGate.run(controller.signal,()=>this.options.worker({config:this.options.provider.get(),scope:{jobId:current.jobId,taskId:current.taskId,taskRevision:current.taskRevision,runtimeEpoch:this.epoch,sessionId:current.sessionId,saveId:current.saveId,branchId:current.branchId,purpose:'characterDialogue'},bundle},controller.signal),1)
   if(this.disposed)return
   const job=this.repository.job(current.jobId)
   if(terminal(job))return
   if(controller.signal.aborted||job.cancelRequestedAt){this.store.transaction(()=>this.repository.changeJob(job.jobId,{status:'cancelled',stage:null}));return}
   const save=this.repository.assertScope(job,true)
   if((save.homeContextRevision??save.contextRevision)!==job.contextRevision||this.store.profile().stateVersion!==job.profileVersion||this.fingerprint()!==job.providerFingerprint)throw new Error('CONTEXT_STALE')
   this.store.transaction(()=>{this.repository.changeJob(job.jobId,{stage:'validating'});const replyId=this.repository.publish(job,result.reply);this.repository.changeJob(job.jobId,{status:'completed',stage:null,resultRef:replyId});this.repository.emit(job,'task.completed',{jobId:job.jobId,taskId:job.taskId,resultRef:replyId,usage:result.usage})})
  }catch(error){
   if(this.disposed)return
   try{const job=this.repository.job(accepted.jobId);if(terminal(job))return;const cancelled=controller.signal.aborted||!!job.cancelRequestedAt,failure=this.failure(error);this.store.transaction(()=>{this.repository.changeJob(job.jobId,{status:cancelled?'cancelled':failure.code==='CONTEXT_STALE'?'superseded':'failed',stage:null,error:cancelled?null:failure});this.repository.emit(job,cancelled?'task.cancelled':'task.failed',{jobId:job.jobId,taskId:job.taskId,errorCode:failure.code})})}catch{/* A deleted save owns no surviving task or result. */}
  }finally{this.controllers.delete(accepted.jobId)}
 }
 private failure(error:unknown){
  const raw=error instanceof Error?error.message:''
  const code=error instanceof z.ZodError?'INVALID_MODEL_OUTPUT':raw==='MODEL_NOT_CONFIGURED'?'INPUT_REQUIRED':raw.includes('AUTHENTICATION_FAILED')?'AUTHENTICATION_FAILED':raw.includes('RATE_LIMITED')?'RATE_LIMITED':raw.includes('BUDGET_EXCEEDED')?'INPUT_REQUIRED':['FORBIDDEN','NOT_FOUND','INVALID_PAYLOAD','IDEMPOTENCY_CONFLICT','STALE_STATE','CONTEXT_STALE','INPUT_REQUIRED','CANCELLED','BUFFER_NOT_READY','INVALID_MODEL_OUTPUT'].includes(raw)?raw:raw.includes('TIMEOUT')||raw.includes('长时间')?'RUNTIME_TIMEOUT':'RUNTIME_UNAVAILABLE'
  const messages:Record<string,string>={INPUT_REQUIRED:raw==='MODEL_NOT_CONFIGURED'?'请先在设置中配置模型，输入草稿已保留。':'本轮达到重试／上下文预算，请调整设定或发起新的明确请求。',AUTHENTICATION_FAILED:'API Key 无效，请在设置中检查后重试。',RATE_LIMITED:'模型服务限流或配额不足，请稍后重试。',FORBIDDEN:'当前存档或分支不允许此操作。',NOT_FOUND:'目标已不存在，请刷新。',INVALID_PAYLOAD:'请求或呈现范围无效。',INVALID_MODEL_OUTPUT:'模型回复未通过格式验证，可重试；未发布无效内容。',IDEMPOTENCY_CONFLICT:'同一操作标识不能用于不同内容。',STALE_STATE:'状态已变化，请刷新后重试。',CONTEXT_STALE:'对话上下文已变化，旧任务不能继续覆盖当前内容。',BUFFER_NOT_READY:'请先完成当前对白的呈现。',CANCELLED:'已停止生成。',RUNTIME_TIMEOUT:'模型请求超时，输入已保留，可明确重试。',RUNTIME_UNAVAILABLE:'回复服务暂时不可用，输入已保留，可明确重试。'}
  return{code,message:messages[code]}
 }
}
