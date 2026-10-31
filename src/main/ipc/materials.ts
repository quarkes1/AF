import {ipcMain,dialog,BrowserWindow,shell} from 'electron'
import {z} from 'zod'
import {materialRequestSchema as envelope,materialCommandSchemas as schema,materialReadCommands as reads} from '../../shared/schemas/materials'
import {randomUUID,createHash} from 'node:crypto'
import {readFile,readdir,stat,realpath} from 'node:fs/promises'
import {basename,extname,join,relative,isAbsolute} from 'node:path'
import type {BackendRequest,BackendResponse,MaterialRecord} from '../../shared/contracts/materials'
import {MaterialService} from '../modules/resources/service'
import {SourceService} from '../modules/resources/sources'
export function installMaterialIpc(service:MaterialService,onProviderChanged?:()=>void){
 const sources=new SourceService(service)
 const pending=new Map<string,{hash:string;promise:Promise<BackendResponse>}>()
 ipcMain.handle('af:materials',(event,raw:unknown)=>{
  const window=BrowserWindow.fromWebContents(event.sender)
  if(!window||event.senderFrame!==event.sender.mainFrame)return{protocolVersion:1,requestId:'',ok:false,stateVersion:null,error:{code:'FORBIDDEN',message:'拒绝非主窗口请求。',retryable:false,detailsRef:null}}
  const parsed=envelope.safeParse(raw)
  if(!parsed.success||!parsed.data.idempotencyKey)return dispatch(raw)
  const r=parsed.data,key=r.idempotencyKey!
  let hash:string
  try{hash=businessHash(r,value=>service.provider.intentHash(value))}catch{return dispatch(raw)}
  const prior=pending.get(key)
  if(prior){if(prior.hash!==hash)return{protocolVersion:1,requestId:r.requestId,ok:false,stateVersion:service.repo.version(),error:{code:'IDEMPOTENCY_CONFLICT',message:'同一意图不能使用不同参数。',retryable:false,detailsRef:null}};return prior.promise.then(response=>({...response,requestId:r.requestId}))}
  const promise=dispatch(raw);pending.set(key,{hash,promise});void promise.finally(()=>pending.delete(key));return promise
 })
 async function dispatch(raw:unknown):Promise<BackendResponse>{
  let request:BackendRequest|undefined,atomic=false
  try{
   request=envelope.parse(raw);if(!Object.hasOwn(schema,request.command))throw new Error('INVALID_PAYLOAD')
   const command=request.command as keyof typeof schema,p=schema[command].parse(request.payload) as any
   const read=reads.has(command);if(read?request.idempotencyKey!==null:!request.idempotencyKey)throw new Error('INVALID_PAYLOAD')
   const expectedKind=command.startsWith('course.')||command.startsWith('textbook.')?'course':command.startsWith('provider.')?'provider':command.startsWith('jobs.')?'job':'resource'
   if(request.target.kind!==expectedKind)throw new Error('FORBIDDEN')
   const businessId=p.id??p.documentVersionId??p.courseId??p.jobId??null
   if(request.target.id!==null&&request.target.id!==businessId)throw new Error('FORBIDDEN')
   const key=request.idempotencyKey
   const hash=businessHash(request,value=>service.provider.intentHash(value))
   const previous=key?service.repo.db.prepare('SELECT hash,result FROM commands WHERE key=?').get(key) as {hash:string;result:string}|undefined:undefined
   if(previous){if(previous.hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');const value=typeof previous.result==='string'?JSON.parse(previous.result):previous.result;return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:service.repo.version(),data:value}}
   if(!read&&request.expectedStateVersion!==null&&request.expectedStateVersion!==service.repo.version())throw new Error('STALE_STATE')
   atomic=!read&&!['course.reviewName','textbook.skip'].includes(command)
   if(atomic)service.repo.beginIntent()
   let result:unknown
   switch(command){
    case 'resource.settings.get':result=service.processingSettings();break
    case 'resource.settings.update':result=service.configureProcessing(p);break
    case 'resource.list':{const all=service.repo.list().filter(d=>(!p.courseId||d.courseIds.includes(p.courseId))&&(!p.status||d.state===p.status));const start=p.cursor?Number(Buffer.from(p.cursor,'base64url').toString()):0;if(!Number.isSafeInteger(start)||start<0)throw new Error('INVALID_PAYLOAD');const limit=p.limit??20;result={items:all.slice(start,start+limit),nextCursor:start+limit<all.length?Buffer.from(String(start+limit)).toString('base64url'):null};break}
    case 'course.list':{const all=service.repo.courses(),start=p.cursor?Number(Buffer.from(p.cursor,'base64url').toString()):0,limit=p.limit??20;if(!Number.isSafeInteger(start)||start<0)throw new Error('INVALID_PAYLOAD');result={items:all.slice(start,start+limit),nextCursor:start+limit<all.length?Buffer.from(String(start+limit)).toString('base64url'):null};break}
    case 'provider.list':result=service.provider.summary();break
    case 'jobs.list':result=service.repo.jobs();break
    case 'jobs.get':result=service.repo.job(p.jobId);break
    case 'resource.upload':{
     const allowed={document:['doc','docx','ppt','pptx','pdf','md','txt'],background:['png','jpg','jpeg','webp'],music:['mp3','wav','ogg','flac','m4a']};const extension=extname(p.filename).slice(1).toLowerCase();if(!allowed[p.kind as keyof typeof allowed].includes(extension)||p.filename!==basename(p.filename)||!p.bytes.length)throw new Error('INVALID_PAYLOAD')
     const bytes=Buffer.from(p.bytes),fingerprint=createHash('sha256').update(bytes).digest('hex'),duplicate=!!service.repo.db.prepare('SELECT 1 FROM materials WHERE fingerprint=? AND kind=?').get(fingerprint,p.kind)
     result={...service.repo.importFile(p.filename,p.kind,bytes,p.metadata),duplicate};break}
    case 'resource.read':{const item=service.repo.get(p.id);if(p.offset>item.size)throw new Error('INVALID_PAYLOAD');result=new Uint8Array(service.repo.bytes(p.id).subarray(p.offset,p.offset+p.length));break}
    case 'resource.update':result=service.repo.transaction(()=>service.repo.update(p.id,p.patch));break
    case 'resource.remove':result=service.repo.remove(p.documentVersionId,p.mode==='deleteManagedCopy');break
    case 'resource.parse':result=service.process(p.documentVersionIds,{password:p.password,encoding:p.encoding,force:p.force});break
    case 'resource.retry':result=service.process([p.documentVersionId]);break
    case 'resource.blocks':result=service.repo.blocks(p.documentVersionId);break
    case 'resource.open':{const block=service.repo.blocks(p.sourceRef.documentVersionId,true).find(b=>b.id===p.sourceRef.blockId);if(!block)throw new Error('NOT_FOUND');result={documentVersionId:p.sourceRef.documentVersionId,block};break}
    case 'resource.image':{if(!service.repo.blocks(p.documentVersionId,true).some(b=>b.imageId===p.imageId))throw new Error('FORBIDDEN');const folder=join(service.repo.root,'cache','parsed',p.documentVersionId.replaceAll('.','_'));const file=(await readdir(folder)).find(f=>f.startsWith(p.imageId+'.')&&/\.(png|jpe?g|webp)$/i.test(f));if(!file)throw new Error('NOT_FOUND');result=new Uint8Array(await readFile(join(folder,file)));break}
    case 'source.retrieve':result={items:service.repo.search(p.query,p.courseId??undefined),nextCursor:null};break
    case 'course.classify':if(p.resetManual)service.repo.transaction(()=>{for(const id of p.documentVersionIds)service.repo.update(id,{manualOverride:false})});result=service.classify(p.documentVersionIds);break
    case 'course.reviewName':result=await service.reviewName(p.name);break
    case 'course.assignName':result=service.assign(p.documentVersionId,p.name,p.decision,p.existingId);break
    case 'course.assign':result=service.repo.transaction(()=>{const course=service.repo.course(p.courseId);for(const id of p.documentVersionIds){const item=service.repo.get(id);service.repo.assign(id,p.operation==='link'?[...item.courseIds,course.id]:item.courseIds.filter(x=>x!==course.id),'manual')}return course});break
    case 'provider.configure':{
     if(p.keyAction==='clear')service.provider.clear()
     else if(p.keyAction==='keep'){const prior=service.provider.get();if(prior.baseUrl!==p.baseUrl.replace(/\/$/,''))throw new Error('切换服务地址时必须提供该服务的新 Key。');service.provider.save(p.baseUrl,p.modelId,prior.apiKey)}
     else service.provider.save(p.baseUrl,p.modelId,p.apiKey)
     for(const job of service.repo.jobs())if(!['parse','scan','import'].includes(job.purpose)&&['queued','running'].includes(job.status))service.cancel(job.id)
     result=service.provider.summary();break}
    case 'provider.test':result=service.startProviderTest();break
    case 'jobs.cancel':result=service.cancel(p.jobId);break
    case 'textbook.suggest':result=service.startTextbook(p.courseId,p.documentVersionIds);break
    case 'textbook.answer':{const t=service.repo.course(p.courseId).textbook;if(!t||!t.question||t.status!=='questioning'||p.questionId!==`${t.chapterMapVersion}:${t.round}`)throw new Error('STALE_STATE');result=service.startTextbook(p.courseId,t.documentIds,p.answer);break}
    case 'textbook.skip':result=await service.textbook(p.courseId,undefined,true);break
    case 'textbook.confirm':result=service.repo.transaction(()=>{const t=service.repo.course(p.courseId).textbook;if(!t||t.chapterMapVersion!==p.chapterMapVersion)throw new Error('STALE_STATE');if(p.candidateId&&!t.candidates.some(c=>c.id===p.candidateId))throw new Error('NOT_FOUND');return service.repo.setTextbook(p.courseId,{...t,selectedId:p.candidateId,status:p.candidateId?'confirmed':'generic',question:null,chapterMapVersion:t.chapterMapVersion+1})});break
    case 'resource.pick':{const selection=await dialog.showOpenDialog({properties:p.mode==='folder'?['openDirectory']:['openFile','multiSelections']});result=selection.canceled?[]:await Promise.all(selection.filePaths.map(path=>sources.add(path)));break}
    case 'resource.scan':result=sources.scan(p.resourceIds,p.recursive);break
    case 'resource.sources':result=sources.list();break
    case 'resource.watch':result=sources.watch(p.sourceId,p.enabled);break
    case 'resource.unlinkSource':result=sources.remove(p.sourceId);break
    case 'resource.importGranted':result=sources.importEntries(p.resourceIds);break
   }
   if(key)service.repo.db.prepare('INSERT INTO commands VALUES(?,?,?)').run(key,hash,JSON.stringify(result))
   if(atomic){service.repo.commitIntent();atomic=false}
   if(command==='provider.configure')onProviderChanged?.()
   return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:service.repo.version(),data:result}
  }catch(error){if(atomic)service.repo.rollbackIntent();const known=['INVALID_PAYLOAD','FORBIDDEN','NOT_FOUND','IDEMPOTENCY_CONFLICT','STALE_STATE'];const message=error instanceof z.ZodError?'请求格式不正确。':error instanceof Error?error.message:'后台请求失败。';const code=known.includes(message)?message:error instanceof z.ZodError?'INVALID_PAYLOAD':'RESOURCE_ERROR';return{protocolVersion:1,requestId:request?.requestId??'',ok:false,stateVersion:service.repo.version(),error:{code,message:message.includes('sk-')?'模型请求失败。':message,retryable:!['FORBIDDEN','INVALID_PAYLOAD','IDEMPOTENCY_CONFLICT'].includes(code),detailsRef:null}}}
 }
 return()=>{sources.dispose();ipcMain.removeHandler('af:materials')}
}

function businessHash(request:BackendRequest,secretHash:(value:string)=>string){const payload=request.payload as Record<string,unknown>;const canonical=JSON.stringify({command:request.command,target:request.target,payload});return payload.apiKey!==undefined||payload.password!==undefined?secretHash(canonical):createHash('sha256').update(canonical).digest('hex')}
