import type {BackendRequest,CourseRecord,MaterialJob,MaterialRecord,NameReview} from '../../../shared/contracts/materials'
import type {LibraryItem} from './model'
const readCommands=new Set(['resource.settings.get','resource.list','course.list','provider.list','jobs.list','jobs.get','resource.read','resource.pick','resource.blocks','resource.image','resource.open','source.retrieve','resource.sources'])
export class BackendClient{
 version=0
 async waitJob(id:string,timeoutMs=150000){const end=Date.now()+timeoutMs;while(Date.now()<end){const job=await this.call<MaterialJob>('jobs.get',{jobId:id},id);if(!job)throw new Error('后台任务已不存在。');if(job.status==='completed')return job.result;if(['failed','cancelled','superseded'].includes(job.status))throw new Error(job.error??'任务未完成。');await new Promise(r=>setTimeout(r,500))}throw new Error('任务仍在后台处理中，可在资料管理中查看或取消。')}
 async call<T=unknown>(command:string,payload:unknown={},targetId:string|null=null):Promise<T>{
  if(!window.afMaterials)throw new Error('桌面后端不可用；请使用 AF 桌面应用。')
  const read=readCommands.has(command)
  const kind=command.startsWith('course.')||command.startsWith('textbook.')?'course':command.startsWith('provider.')?'provider':command.startsWith('jobs.')?'job':'resource'
  const request:BackendRequest={protocolVersion:1,requestId:crypto.randomUUID(),command,target:{kind,id:targetId},saveId:null,branchId:null,expectedStateVersion:read?null:this.version,idempotencyKey:read?null:crypto.randomUUID(),payload}
  for(let attempt=0;attempt<2;attempt++){
   const result=await window.afMaterials.request(request);if(result.stateVersion!==null)this.version=result.stateVersion
   if(result.ok)return result.data as T
   if(result.error.code==='STALE_STATE'&&attempt===0){request.requestId=crypto.randomUUID();request.expectedStateVersion=this.version;continue}
   throw new Error(result.error.message)
  }
  throw new Error('状态已更新，请重新操作。')
 }
}
export class NativeMaterialStorage{
 readonly client=new BackendClient()
 courses:CourseRecord[]=[];jobs:MaterialJob[]=[];provider={configured:false,model:'deepseek-flash',baseUrl:'https://api.deepseek.com'}
 private cache=new Map<string,Blob>();private records=new Map<string,MaterialRecord>()
 async all():Promise<LibraryItem[]>{
  const records:MaterialRecord[]=[];let cursor:string|null=null
  do{const page:{items:MaterialRecord[];nextCursor:string|null}=await this.client.call('resource.list',{limit:100,cursor});records.push(...page.items);cursor=page.nextCursor}while(cursor)
  this.courses=[];let courseCursor:string|null=null;do{const page:{items:CourseRecord[];nextCursor:string|null}=await this.client.call('course.list',{limit:100,cursor:courseCursor});this.courses.push(...page.items);courseCursor=page.nextCursor}while(courseCursor)
  this.jobs=await this.client.call<MaterialJob[]>('jobs.list');this.provider=await this.client.call('provider.list')
  const items:LibraryItem[]=[]
  for(const record of records){let blob=this.cache.get(record.id);if(!blob){const chunks:Uint8Array<ArrayBuffer>[]=[];for(let offset=0;offset<record.size;offset+=4*1024*1024){const chunk=await this.client.call<Uint8Array>('resource.read',{id:record.id,offset,length:4*1024*1024},record.id);chunks.push(new Uint8Array(chunk))}blob=new Blob(chunks,{type:record.mime});this.cache.set(record.id,blob)}items.push({...record,blob});this.records.set(record.id,record)}
  return items
 }
 async put(item:LibraryItem):Promise<LibraryItem>{
  let record:MaterialRecord&{duplicate?:boolean}
  if(this.records.has(item.id))record=await this.client.call('resource.update',{id:item.id,patch:{name:item.name,textbook:item.textbook,chapter:item.chapter,position:item.position}},item.id)
  else{
    record=await this.client.call('resource.upload',{filename:item.filename,kind:item.kind,bytes:new Uint8Array(await item.blob.arrayBuffer()),metadata:{mime:item.mime,...item.width?{width:item.width,height:item.height}:{},...item.duration?{duration:item.duration}:{}}})
    if(!record.duplicate){
      if(item.subject&&!record.subject)record=await this.client.call('course.assignName',{documentVersionId:record.id,name:item.subject,decision:'direct',existingId:null})
      if(item.name!==record.name||item.textbook||item.chapter||item.position!==50)record=await this.client.call('resource.update',{id:record.id,patch:{name:item.name,textbook:item.textbook,chapter:item.chapter,position:item.position}},record.id)
    }
  }
  this.cache.set(record.id,item.blob);this.records.set(record.id,record);return{...record,blob:item.blob}
 }
 async remove(id:string,deleteCopy=false){await this.client.call('resource.remove',{documentVersionId:id,mode:deleteCopy?'deleteManagedCopy':'unlink'},id);this.records.delete(id);this.cache.delete(id)}
 async reviewName(name:string){return this.client.call<NameReview>('course.reviewName',{name})}
}
