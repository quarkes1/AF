import {randomUUID,createHash} from 'node:crypto'
import {readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {classifyContent,type CategoryContext} from './classification'
import {MaterialRepository,normalizeCourse} from './repository'
import type {MaterialJob,MaterialSnapshot,ContentBlock,NameReview,TextbookState} from '../../../shared/contracts/materials'
import type {ProviderProfile} from '../../infrastructure/providers/profile'
import {runWorker} from '../../runtime/bridge/worker'
import type {ParsedDocument} from '../../infrastructure/parsers/document'

const nameResult=z.object({courseId:z.string().nullable(),reason:z.string().max(1000)}).strict()
const textbookResult=z.object({candidates:z.array(z.object({title:z.string().max(160),author:z.string().nullable(),publisher:z.string().nullable(),edition:z.string().nullable(),isbn:z.string().nullable(),evidenceBlockIds:z.array(z.string()),evidenceInputIds:z.array(z.string()).optional(),confidence:z.enum(['explicit','partial','similar'])}).strict()).max(5),question:z.string().max(500).nullable()}).strict()
export class MaterialService{
 readonly aborts=new Map<string,AbortController>()
 private parseRunning=0;private modelRunning=0;private parseWait:(()=>void)[]=[];private modelWait:(()=>void)[]=[]
 constructor(readonly repo:MaterialRepository,readonly provider:ProviderProfile,private paths:{parser:string;agent:string;runtime:string;skill:string},private execute=runWorker){}
 snapshot():MaterialSnapshot{return{items:this.repo.list(),courses:this.repo.courses(),jobs:this.repo.jobs(),provider:this.provider.summary(),stateVersion:this.repo.version()}}
 private async slot<T>(kind:'parse'|'model',operation:()=>Promise<T>){const wait=kind==='parse'?this.parseWait:this.modelWait;while((kind==='parse'?this.parseRunning:this.modelRunning)>=2)await new Promise<void>(r=>wait.push(r));kind==='parse'?this.parseRunning++:this.modelRunning++;try{return await operation()}finally{kind==='parse'?this.parseRunning--:this.modelRunning--;wait.shift()?.()}}
 private job(purpose:MaterialJob['purpose'],ids:string[]){const job:MaterialJob={id:randomUUID(),purpose,status:'queued',documentIds:ids,error:null,completed:0,total:ids.length,createdAt:Date.now()};this.repo.putJob(job);this.aborts.set(job.id,new AbortController());return job}
 private status(job:MaterialJob,patch:Partial<MaterialJob>){const saved=this.repo.jobs().find(j=>j.id===job.id);if(saved&&['cancelled','superseded'].includes(saved.status)&&patch.status!==saved.status)return;Object.assign(job,patch);this.repo.putJob(job)}
 cancel(id:string){const controller=this.aborts.get(id);if(controller)controller.abort();const job=this.repo.jobs().find(j=>j.id===id);if(job&&['queued','running','waiting_user'].includes(job.status))this.status(job,{status:'cancelled',error:'已取消；已完成的资料保留。'});return{cancelAccepted:!!controller}}
 dispose(){for(const controller of this.aborts.values())controller.abort()}
 process(ids:string[],options:{password?:string;encoding?:string;force?:boolean}={}){
  const allowed=[...new Set(ids)].map(id=>this.repo.get(id)).filter(d=>d.kind==='document')
  const job=this.job('parse',allowed.map(x=>x.id));void this.parseBatch(job,options);return{jobId:job.id,turnId:null,status:'queued',pollAfterMs:250}
 }
 private async parseBatch(job:MaterialJob,options:{password?:string;encoding?:string;force?:boolean}){
  const controller=this.aborts.get(job.id)!,signal=controller.signal;this.status(job,{status:'running'})
  const ready:string[]=[]
  try{
   await Promise.all(job.documentIds.map(id=>this.slot('parse',async()=>{
    if(signal.aborted)return
    const doc=this.repo.get(id);if(!options.force&&doc.blocks&&doc.state==='ready'){ready.push(id);this.status(job,{completed:job.completed+1});return}
    this.repo.transaction(()=>this.repo.update(id,{state:'parsing',error:null}))
    try{
     const parsed=await this.execute<ParsedDocument>(this.paths.parser,{id,extension:doc.extension,bytes:this.repo.bytes(id),cacheDir:join(this.repo.root,'cache','parsed',id.replaceAll('.','_')),runtimeDir:this.paths.runtime,...options},signal)
     signal.throwIfAborted();this.repo.setBlocks(id,parsed.blocks)
     if(parsed.warnings.length)this.repo.transaction(()=>this.repo.update(id,{state:'partial',error:parsed.warnings.join('\n')}))
     ready.push(id)
    }catch(error){if(!signal.aborted)this.repo.transaction(()=>this.repo.update(id,{state:'failed',error:this.message(error)}))}
    finally{if(signal.aborted)this.repo.transaction(()=>{if(this.repo.get(id).state==='parsing')this.repo.update(id,{state:'queued',error:'解析已取消，可重试。'})});this.status(job,{completed:job.completed+1})}
   })))
   signal.throwIfAborted();this.status(job,{status:ready.length?'completed':'failed',error:ready.length?null:'没有成功解析的资料，请查看单个文件状态。'})
   if(ready.length&&this.provider.summary().configured)this.classify(ready)
  }catch(error){this.status(job,{status:signal.aborted?'cancelled':'failed',error:this.message(error)})}finally{this.aborts.delete(job.id)}
 }
 private classificationTail:Promise<void>=Promise.resolve()
 classify(ids:string[]){
  const docs=[...new Set(ids)].map(id=>this.repo.get(id)).filter(d=>!d.manualOverride&&d.blocks>0)
  const job=this.job('resourceClassify',docs.map(x=>x.id))
  // Keep reconciliation and commit in library order, so concurrent imports see the preceding canonical category.
  this.classificationTail=this.classificationTail.then(()=>this.classifyBatch(job)).catch(()=>{})
  return{jobId:job.id,turnId:null,status:'queued',pollAfterMs:250}
 }
 private async classifyBatch(job:MaterialJob){
  const signal=this.aborts.get(job.id)!.signal
  try{
   signal.throwIfAborted();this.status(job,{status:'running'})
   const result={classified:0,needsReview:0}
   // Bound output/tool budgets per discovery window; later windows see earlier committed categories.
   for(let offset=0;offset<job.documentIds.length;offset+=3){
    const part=await classifyContent(this.repo,job.documentIds.slice(offset,offset+3),signal,async(stage,input,documentIds,catalog)=>{
     this.status(job,{result:{stage}})
     return this.model(job,input,signal,{purpose:stage,documentIds,catalog})
    })
    result.classified+=part.classified;result.needsReview+=part.needsReview
    this.status(job,{completed:Math.min(offset+3,job.total)})
   }
   signal.throwIfAborted();this.status(job,{status:'completed',completed:job.total,result})
  }catch(error){this.status(job,{status:signal.aborted?'cancelled':'failed',error:this.message(error)})}finally{this.aborts.delete(job.id)}
 }
 async reviewName(name:string,signal=AbortSignal.timeout(90000),record=true):Promise<NameReview>{
  const exact=this.repo.findCourse(name);if(exact)return{name,existing:exact,reason:'已匹配科目或确认别名。',reviewed:true}
  const courses=this.repo.courses();if(!courses.length)return{name,existing:null,reason:'暂无已有科目。',reviewed:true}
  if(!this.provider.summary().configured)return{name,existing:null,reason:'未配置模型，暂不能完成语义去重检查。',reviewed:false}
  const job=this.job('courseNameReview',[])
  try{this.status(job,{status:'running'});const combined=AbortSignal.any([signal,this.aborts.get(job.id)!.signal]);const data=nameResult.parse(await this.model(job,{instruction:'Review ONLY the proposed course name against existing catalog, use course_catalog. Return JSON {courseId:similar existing course UUID or null,reason:brief explanation}. Never merge explicitly separated subjects.',name},combined));combined.throwIfAborted();const existing=data.courseId?this.repo.course(data.courseId):null;signal.throwIfAborted();this.status(job,{status:'completed'});return{name,existing,reason:data.reason,reviewed:true}}
  catch(error){this.status(job,{status:signal.aborted?'cancelled':'failed',error:this.message(error)});throw error}finally{this.aborts.delete(job.id)}
 }
 assign(id:string,name:string,decision:'existing'|'new'|'direct',existingId:string|null){return this.repo.transaction(()=>{
  const current=this.repo.get(id);let course=decision==='existing'&&existingId?this.repo.course(existingId):this.repo.findCourse(name)
  if(decision==='existing'&&course)this.repo.addAlias(course.id,name)
  if(!course){course=this.repo.createCourse(name);if(decision==='new'&&existingId)this.repo.separateCourses(course.id,existingId)}
  return this.repo.assign(current.id,[course.id],'manual')
 })}
 async textbook(courseId:string,answer?:string,skip=false,documentIds?:string[],existingJob?:MaterialJob){
  const course=this.repo.course(courseId),prior=course.textbook
  const requested=documentIds??prior?.documentIds;
  if(requested?.some(id=>!this.repo.get(id).courseIds.includes(courseId)))throw new Error('FORBIDDEN');
  const documents=this.repo.list().filter(d=>d.courseIds.includes(courseId)&&d.blocks&&(!requested||requested.includes(d.id)))
  const answerEvidence=(this.repo.db.prepare('SELECT job_id,answer FROM textbook_answers WHERE course_id=? ORDER BY rowid').all(courseId) as {job_id:string;answer:string}[]).map(r=>({inputId:r.job_id,text:r.answer}))
  const headings=documents.flatMap(d=>this.repo.blocks(d.id).filter(b=>b.kind==='heading').map(b=>({title:b.text,blockIds:[b.id]})))
  if(skip||prior&&prior.round>=3){const value:TextbookState={status:prior?.candidates.some(c=>c.confidence==='explicit')?'inferred':'generic',round:prior?.round??0,question:null,candidates:prior?.candidates??[],selectedId:prior?.candidates.find(c=>c.confidence==='explicit')?.id??null,chapterMapVersion:(prior?.chapterMapVersion??0)+1,documentIds:documents.map(d=>d.id),chapters:headings};return this.repo.transaction(()=>this.repo.setTextbook(courseId,value))}
  const job=existingJob??this.job('textbookIdentify',documents.map(d=>d.id)),signal=this.aborts.get(job.id)!.signal
  try{
   this.status(job,{status:'running'});const result=textbookResult.parse(await this.model(job,{instruction:'Identify textbook from authorized source blocks and explicitly accepted user answers. Return JSON {candidates:[{title,author,publisher,edition,isbn,evidenceBlockIds,evidenceInputIds,confidence:explicit/partial/similar}],question:one short clarifying question or null}. Cite block IDs for document evidence and inputId for user answers; keep them separate. Unknown fields=null. No invented textbook editions. Preserve chapter headings.',course:course.name,previous:prior,answer:answer??null,answerEvidence,documents:documents.map(d=>({id:d.id,filename:d.filename}))},signal))
   const blockIds=new Set(documents.flatMap(d=>this.repo.blocks(d.id).map(b=>b.id)))
   const sourceBlocks=documents.flatMap(d=>this.repo.blocks(d.id))
   const candidates=result.candidates.filter(c=>(c.evidenceBlockIds.length||c.evidenceInputIds?.length)&&c.evidenceBlockIds.every(id=>blockIds.has(id))&&(c.evidenceInputIds??[]).every(id=>answerEvidence.some(a=>a.inputId===id))).map(c=>{
    const evidence=[...sourceBlocks.filter(b=>c.evidenceBlockIds.includes(b.id)).map(b=>b.text),...answerEvidence.filter(a=>c.evidenceInputIds?.includes(a.inputId)).map(a=>a.text)].join('\n').normalize('NFKC').replace(/\s|-/g,'')
    const supported=(value:string|null)=>value&&evidence.includes(value.normalize('NFKC').replace(/\s|-/g,''))?value:null
    const author=supported(c.author),publisher=supported(c.publisher),edition=supported(c.edition),isbn=supported(c.isbn)
    const explicit=!!supported(c.title)&&!!(author||publisher||isbn)
    return{...c,id:randomUUID(),author,publisher,edition,isbn,confidence:c.confidence==='explicit'&&!explicit?'similar' as const:c.confidence}
   })
   const round=(prior?.round??0)+(answer!==undefined?1:0)
   const value:TextbookState={status:result.question&&round<3?'questioning':candidates.some(c=>c.confidence==='explicit')?'inferred':'generic',round,question:round<3?result.question:null,candidates,selectedId:candidates.find(c=>c.confidence==='explicit')?.id??null,chapterMapVersion:(prior?.chapterMapVersion??0)+1,documentIds:documents.map(d=>d.id),chapters:headings}
   signal.throwIfAborted();this.repo.transaction(()=>{if(this.repo.course(courseId).stateVersion!==course.stateVersion)throw new Error('STALE_STATE');this.repo.setTextbook(courseId,value)});this.status(job,{status:'completed'});return this.repo.course(courseId)
  }catch(error){this.status(job,{status:signal.aborted?'cancelled':'failed',error:this.message(error)});throw error}finally{this.aborts.delete(job.id)}
 }
 startTextbook(courseId:string,documentIds?:string[],answer?:string){
  this.repo.course(courseId);if(documentIds?.some(id=>!this.repo.get(id).courseIds.includes(courseId)))throw new Error('FORBIDDEN')
  const textbook=this.repo.course(courseId).textbook,questionId=textbook?`${textbook.chapterMapVersion}:${textbook.round}`:null
  if(answer!==undefined&&questionId){const prior=this.repo.db.prepare('SELECT job_id FROM textbook_answers WHERE course_id=? AND question_id=?').get(courseId,questionId) as {job_id:string}|undefined;if(prior&&!['failed','cancelled'].includes(this.repo.job(prior.job_id).status))throw new Error('STALE_STATE')}
  const job=this.job('textbookIdentify',documentIds??this.repo.list().filter(d=>d.courseIds.includes(courseId)).map(d=>d.id))
  if(answer!==undefined&&questionId)this.repo.db.prepare('INSERT INTO textbook_answers VALUES(?,?,?,?) ON CONFLICT(course_id,question_id) DO UPDATE SET job_id=excluded.job_id,answer=excluded.answer').run(courseId,questionId,job.id,answer)
  void this.textbook(courseId,answer,false,documentIds,job).then(()=>{const saved=this.repo.job(job.id);if(['queued','running'].includes(saved.status))this.status(job,{status:'completed'})}).catch(error=>{this.status(job,{status:'failed',error:this.message(error)})}).finally(()=>this.aborts.delete(job.id))
  return{jobId:job.id,turnId:null,status:'queued',pollAfterMs:250}
 }
 startProviderTest(){const job=this.job('providerTest',[]);const signal=this.aborts.get(job.id)!.signal;this.status(job,{status:'running'});void this.provider.test(signal).then(result=>{signal.throwIfAborted();this.status(job,{status:'completed',result})}).catch(error=>this.status(job,{status:signal.aborted?'cancelled':'failed',error:this.message(error)})).finally(()=>this.aborts.delete(job.id));return{jobId:job.id,turnId:null,status:'queued',pollAfterMs:250}}
 private async model(job:MaterialJob,input:unknown,signal:AbortSignal,scope?:{purpose:'resourceClassify'|'resourceReconcile';documentIds:string[];catalog:CategoryContext[]}){
  return this.slot('model',async()=>{
   signal.throwIfAborted()
   const purpose=scope?.purpose??job.purpose,documents=(scope?.documentIds??job.documentIds).map(id=>({id,filename:this.repo.get(id).filename,blocks:this.repo.blocks(id)}))
   const catalog=scope?.catalog??this.repo.courses(),separations=purpose==='resourceClassify'?[]:this.repo.separations()
   const contextHash=createHash('sha256').update(JSON.stringify({purpose,input,documents,catalog,separations})).digest('hex')
   this.status(job,{contextHash})
   return this.execute<unknown>(this.paths.agent,{config:this.provider.get(),purpose,input,catalog,separations,documents,skill:readFileSync(this.paths.skill,'utf8')},signal,120000)
  })
 }
 private message(error:unknown){const message=error instanceof Error?error.message:'任务失败。';return message.includes('sk-')?'模型调用失败，详见服务商配置。':message.slice(0,1000)}
}
