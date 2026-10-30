import type {ResourceCatalog} from '../../app/resources'
import {LibraryStorage} from './storage'
import {acceptsFile,cleanName,fileExtension,type LibraryItem,type LibraryKind} from './model'
import type {CourseRecord,MaterialJob,NameReview} from '../../../shared/contracts/materials'

export interface ImportProgress{completed:number;total:number;filename:string;failures:{name:string;reason:string}[];duplicates:number}
interface Snapshot{items:readonly LibraryItem[];warning:string|null;loaded:boolean;courses?:CourseRecord[];jobs?:MaterialJob[];sourceAnchor?:{id:string;page:number;blockId:string;revision:number}}
export class MaterialLibrary{
  private snapshot:Snapshot={items:[],warning:null,loaded:false}
  private listeners=new Set<()=>void>()
  private urls=new Map<string,string>()
  private importing=false
  private writes:Promise<void>=Promise.resolve()
  private poll?:ReturnType<typeof setInterval>
  private refreshing=false
  constructor(private resources:ResourceCatalog,private storage=new LibraryStorage()){}
  getSnapshot=()=>this.snapshot
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  private publish(items=this.snapshot.items,warning=this.snapshot.warning){this.snapshot={...this.snapshot,items,warning,loaded:true,courses:this.storage.native?.courses,jobs:this.storage.native?.jobs};this.listeners.forEach(listener=>listener())}
  private register(item:LibraryItem){
    const url=URL.createObjectURL(item.blob);this.urls.set(item.id,url)
    if(item.kind!=='document')this.resources.registerLocal(item.id,url)
  }
  async load(){
    try{const items=await this.storage.all();for(const item of items)this.register(item);this.publish(items,null);if(this.storage.native&&!this.poll)this.poll=setInterval(()=>{void this.refresh()},1000)}
    catch(error){this.publish([],error instanceof Error?error.message:'本地资源库读取失败。')}
  }
  get backend(){return this.storage.native?.client??null}
  async openSource(documentVersionId:string,blockId:string){if(!this.backend)return;const result=await this.backend.call<{documentVersionId:string;block:{page:number}}>('resource.open',{sourceRef:{documentVersionId,blockId}});this.snapshot={...this.snapshot,sourceAnchor:{id:documentVersionId,page:result.block.page,blockId,revision:Date.now()}};this.publish()}
  async refresh(){if(this.refreshing)return;this.refreshing=true;try{const items=await this.storage.all();for(const item of items)if(!this.urls.has(item.id))this.register(item);this.publish(items,null)}catch(error){this.publish(this.snapshot.items,error instanceof Error?error.message:'读取后台状态失败。')}finally{this.refreshing=false}}
  async process(ids:string[],classify=false){if(this.backend){await this.backend.call(classify?'course.classify':'resource.parse',{documentVersionIds:ids});await this.refresh()}}
  async reviewName(name:string):Promise<NameReview|null>{return this.storage.native?this.storage.native.reviewName(name):null}
  async assign(id:string,name:string,decision:'existing'|'new'|'direct',existingId:string|null){if(!this.backend)return this.update(id,{subject:name});await this.backend.call('course.assignName',{documentVersionId:id,name,decision,existingId},null);await this.refresh()}
  url(item:LibraryItem){return this.urls.get(item.id)??''}
  private enqueue<T>(operation:()=>Promise<T>){const task=this.writes.then(operation);this.writes=task.then(()=>{},()=>{});return task}
  async import(files:readonly File[],kind:LibraryKind,onProgress:(progress:ImportProgress)=>void,signal:AbortSignal){
    if(this.importing)throw new Error('请等待当前导入结束。')
    this.importing=true
    const progress:ImportProgress={completed:0,total:files.length,filename:'',failures:[],duplicates:0}
    const imported:string[]=[]
    try{
      for(const file of files){
        if(signal.aborted)break
        progress.filename=file.name;onProgress({...progress,failures:[...progress.failures]})
        try{
          if(!acceptsFile(kind,file.name))throw new Error('此分类不支持该文件格式。')
          if(!file.size)throw new Error('文件内容为空。')
          const buffer=await file.arrayBuffer();if(signal.aborted)break
          const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('')
          const id=`user.${kind}.${fingerprint}`
          if(this.snapshot.items.some(item=>item.id===id)){progress.duplicates++}
          else{
            const metadata=kind==='document'?{}:await mediaMetadata(file,kind,signal)
            if(signal.aborted)break
            const now=Date.now()
            const item:LibraryItem={id,kind,name:file.name.replace(/\.[^.]+$/,'')||file.name,filename:file.name,extension:fileExtension(file.name),mime:file.type,size:file.size,blob:file,addedAt:now,updatedAt:now,subject:'',textbook:'',chapter:'',position:50,...metadata}
            await this.enqueue(async()=>{const stored=await this.storage.put(item)??item;if(this.snapshot.items.some(x=>x.id===stored.id)){progress.duplicates++;return}this.register(stored);this.publish([...this.snapshot.items,stored],null);if(kind==='document')imported.push(stored.id)})
          }
        }catch(error){if(!signal.aborted)progress.failures.push({name:file.name,reason:error instanceof Error?error.message:'文件导入失败。'})}
        progress.completed++;onProgress({...progress,failures:[...progress.failures]})
      }
      if(imported.length)await this.process(imported)
      return progress
    }finally{this.importing=false}
  }
  async update(id:string,patch:Partial<Pick<LibraryItem,'name'|'subject'|'textbook'|'chapter'|'position'>>){
    return this.enqueue(async()=>{
    const item=this.snapshot.items.find(item=>item.id===id);if(!item)throw new Error('资源已不存在。')
    const next={...item,...patch,updatedAt:Date.now()}
    if(!cleanName(next.name))throw new Error('名称不能为空。')
    next.name=cleanName(next.name)!
    if(!Number.isFinite(next.position))next.position=50
    next.position=Math.min(100,Math.max(0,next.position))
    const stored=await this.storage.put(next)??next;this.publish(this.snapshot.items.map(item=>item.id===id?stored:item),null)
    })
  }
  async remove(id:string,deleteCopy=false){
    return this.enqueue(async()=>{
    await this.storage.remove(id,deleteCopy)
    this.resources.removeLocal(id)
    const url=this.urls.get(id);if(url)URL.revokeObjectURL(url);this.urls.delete(id)
    this.publish(this.snapshot.items.filter(item=>item.id!==id),null)
    })
  }
}

async function mediaMetadata(file:File,kind:'background'|'music',signal:AbortSignal):Promise<{width:number;height:number}|{duration:number}>{
  const url=URL.createObjectURL(file)
  try{return await new Promise((resolve,reject)=>{
    const element=kind==='background'?new Image():new Audio()
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);element.onload=null;element.onerror=null;if(element instanceof HTMLAudioElement){element.onloadedmetadata=null;element.pause();element.removeAttribute('src');element.load()}}
    const finish=(value?:{width:number;height:number}|{duration:number},error?:string)=>{cleanup();error?reject(new Error(error)):resolve(value!)}
    const abort=()=>finish(undefined,'已取消导入。')
    const timer=setTimeout(()=>finish(undefined,'读取媒体超时，文件可能损坏或编码不受支持。'),15000)
    signal.addEventListener('abort',abort,{once:true})
    element.onerror=()=>finish(undefined,'无法读取此媒体，请检查文件内容和编码。')
    if(element instanceof HTMLImageElement)element.onload=()=>finish({width:element.naturalWidth,height:element.naturalHeight})
    else {element.preload='metadata';element.onloadedmetadata=()=>Number.isFinite(element.duration)&&element.duration>0?finish({duration:element.duration}):finish(undefined,'无法读取音乐时长。')}
    element.src=url
  })}finally{URL.revokeObjectURL(url)}
}
