import type {CharacterTemplate,StoryRecord,StorySummary,StorySelection,StoryBridge} from '../../../shared/contracts/story'
import type {CompanionView} from '../companions/model'
import type {StoryView} from './model'
export const templateView=(t:CharacterTemplate):CompanionView=>({...t.content,id:t.id,builtIn:t.builtIn,draft:t.draft,templateVersion:t.templateVersion})
export const storyView=(s:StorySummary|StoryRecord):StoryView=>({id:s.id,name:s.name,partner:'characterSnapshot'in s?s.characterSnapshot.content.name:s.partnerName,partnerId:s.characterTemplateId,chapter:s.chapter,chapterName:s.chapterName,lastLine:s.lastLine,savedAt:s.createdAt,modifiedAt:s.updatedAt,status:'ready',checkpoints:[],branchId:s.branchId,...'characterSnapshot'in s?{companionSnapshot:templateView(s.characterSnapshot)}:{}})
export class StoryClient{
 private versions=new Map<string,number>()
 constructor(private bridge:StoryBridge){}
 async call<T>(command:string,payload:Record<string,unknown>={}):Promise<T>{
  const read=command.endsWith('.get')||command.endsWith('.list')
  const key=command==='template.select'||command==='selection.get'?'selection':payload.saveId?`save:${payload.saveId}`:payload.id?`template:${payload.id}`:command
  if(!read&&!command.endsWith('.create')&&(!this.versions.has(key)||command==='template.select'))await this.call(key==='selection'?'selection.get':payload.saveId?'save.get':'template.get',key==='selection'?{}:payload.saveId?{saveId:payload.saveId}:{id:payload.id})
  const response=await this.bridge.request({protocolVersion:1,requestId:crypto.randomUUID(),command,target:{kind:command.startsWith('template.')?'template':command.startsWith('save.')?'save':'selection',id:(payload.id??payload.saveId??null) as string|null},saveId:(payload.saveId??null) as string|null,branchId:(payload.branchId??null) as string|null,expectedStateVersion:command.endsWith('.create')?null:this.versions.get(key)??null,idempotencyKey:read?null:crypto.randomUUID(),payload})
  if(response.stateVersion!==null)this.versions.set(key,response.stateVersion)
  if(!response.ok)throw new Error(response.error.message)
  const remember=(entry:any)=>{if(entry?.id&&typeof entry.templateVersion==='number')this.versions.set(`template:${entry.id}`,entry.templateVersion);else if(entry?.id&&typeof entry.stateVersion==='number')this.versions.set(`save:${entry.id}`,entry.stateVersion)}
  remember(response.data);if(response.data&&typeof response.data==='object'&&'items'in response.data&&Array.isArray(response.data.items))response.data.items.forEach(remember)
  return response.data as T
 }
 async list<T>(command:string){const all:T[]=[];let cursor:string|null=null;do{const result:{items:T[];nextCursor:string|null}=await this.call<{items:T[];nextCursor:string|null}>(command,{limit:100,cursor});all.push(...result.items);cursor=result.nextCursor}while(cursor);return all}
 async load(){const templates=await this.list<CharacterTemplate>('template.list'),saves=await this.list<StorySummary>('save.list'),selection=await this.call<StorySelection>('selection.get');return{templates:templates.map(templateView),stories:saves.map(storyView),selection,activeStory:selection.kind==='save'?storyView(await this.call<StoryRecord>('save.get',{saveId:selection.saveId})):null}}
 async saveTemplate(item:CompanionView,known:boolean){const {id,builtIn:_,draft,templateVersion, ...content}=item;const template=await this.call<CharacterTemplate>(known?'template.update':'template.create',{...known?{id,templateVersion}:{},content,draft});return templateView(template)}
}
