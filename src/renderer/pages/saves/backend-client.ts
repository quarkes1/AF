import {graphemeCount} from '../../../shared/graphemes'
import type {CharacterTemplate,StoryRecord,StorySummary,StorySelection,StoryBridge} from '../../../shared/contracts/story'
import type {CompanionView} from '../companions/model'
import type {StoryView} from './model'
export const templateView=(t:CharacterTemplate):CompanionView=>({...t.content,id:t.id,builtIn:t.builtIn,draft:t.draft,templateVersion:t.templateVersion})
export const storyView=(s:StorySummary|StoryRecord):StoryView=>({id:s.id,name:s.name,partner:'characterSnapshot'in s?s.characterSnapshot.content.name:s.partnerName,partnerId:s.characterTemplateId,chapter:s.chapter,chapterName:s.chapterName,lastLine:s.lastLine,savedAt:s.createdAt,modifiedAt:s.updatedAt,status:'ready',checkpoints:[],branchId:s.branchId,...'characterSnapshot'in s?{companionSnapshot:templateView(s.characterSnapshot)}:{}})
export class StoryClientError extends Error{constructor(readonly code:string,message:string){super(message)}}
export class StoryClient{
 private versions=new Map<string,number>()
 constructor(private bridge:StoryBridge){}
 private rememberVersion(key:string,version:number){this.versions.set(key,Math.max(this.versions.get(key)??0,version))}
 async call<T>(command:string,payload:Record<string,unknown>={},scope?:{saveId:string;branchId:string},intentKey?:string):Promise<T>{
  const home=command.startsWith('home.')||command.startsWith('story.')||command.startsWith('learning.'),job=command.startsWith('jobs.'),profile=command.startsWith('profile.')
  const read=command.endsWith('.get')||command.endsWith('.list')||['story.history','story.buffer.status','save.checkpoints','save.replay'].includes(command)
  const saveId=(scope?.saveId??payload.saveId??null) as string|null,branchId=(scope?.branchId??payload.branchId??null) as string|null
  const key=job?`job:${payload.jobId}`:profile?'profile':command==='template.select'||command==='selection.get'?'selection':home||payload.saveId?`save:${saveId}`:payload.id?`template:${payload.id}`:command
  if(!read&&!command.endsWith('.create')&&(!this.versions.has(key)||command==='template.select')){
   if(job)await this.call('jobs.get',{jobId:payload.jobId},scope)
   else if(profile)await this.call('profile.get')
   else if(home||payload.saveId)await this.call('save.get',{saveId})
   else await this.call(key==='selection'?'selection.get':'template.get',key==='selection'?{}:{id:payload.id})
  }
  const response=await this.bridge.request({protocolVersion:1,requestId:crypto.randomUUID(),command,target:{kind:job?'job':profile?'profile':home||command.startsWith('save.')?'save':command.startsWith('template.')?'template':'selection',id:job?payload.jobId as string:home?saveId:(payload.id??payload.saveId??null) as string|null},saveId,branchId,expectedStateVersion:command.endsWith('.create')?null:this.versions.get(key)??null,idempotencyKey:read?null:intentKey??crypto.randomUUID(),payload})
  if(response.stateVersion!==null)this.rememberVersion(key,response.stateVersion)
  if(!response.ok)throw new StoryClientError(response.error.code,response.error.message)
  const remember=(entry:any)=>{if(entry?.id&&typeof entry.templateVersion==='number')this.rememberVersion(`template:${entry.id}`,entry.templateVersion);else if(entry?.id&&typeof entry.stateVersion==='number')this.rememberVersion(`save:${entry.id}`,entry.stateVersion);else if(entry?.jobId&&typeof entry.stateVersion==='number')this.rememberVersion(`job:${entry.jobId}`,entry.stateVersion)}
  remember(response.data);if(response.data&&typeof response.data==='object'&&'items'in response.data&&Array.isArray(response.data.items))response.data.items.forEach(remember)
  return response.data as T
 }
 async list<T>(command:string){const all:T[]=[];let cursor:string|null=null;do{const result:{items:T[];nextCursor:string|null}=await this.call<{items:T[];nextCursor:string|null}>(command,{limit:100,cursor});all.push(...result.items);cursor=result.nextCursor}while(cursor);return all}
 async load(legacyName='我'){
  let profile=await this.call<import('../../../shared/contracts/home-chat').UserProfile>('profile.get')
  if(profile.stateVersion===0){profile=await this.call('profile.update',{patch:{displayName:legacyName.trim()&&graphemeCount(legacyName.trim())<=32?legacyName.trim():'我'}})}
  const templates=await this.list<CharacterTemplate>('template.list'),saves=await this.list<StorySummary>('save.list'),selection=await this.call<StorySelection>('selection.get')
  return{profile,templates:templates.map(templateView),stories:saves.map(storyView),selection,activeStory:selection.kind==='save'?storyView(await this.call<StoryRecord>('save.get',{saveId:selection.saveId})):null}
 }
 async saveTemplate(item:CompanionView,known:boolean){const {id,builtIn:_,draft,templateVersion, ...content}=item;const template=await this.call<CharacterTemplate>(known?'template.update':'template.create',{...known?{id,templateVersion}:{},content,draft});return templateView(template)}
}
