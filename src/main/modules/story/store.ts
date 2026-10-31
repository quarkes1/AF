import {DatabaseSync} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,existsSync,copyFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import type {UserProfile} from '../../../shared/contracts/home-chat'
import type {CharacterContent,CharacterTemplate,StoryRecord,StorySummary,StorySelection,StoryRequest,StoryResponse} from '../../../shared/contracts/story'
import {storyCommandSchemas,storyReads,storyRequestSchema} from '../../../shared/schemas/story'

interface Resources{isRegistered:(id:string)=>boolean;isValidPng:(data:string)=>boolean;courseExists:(id:string)=>boolean}
const poses=['日常','微笑','思考','困惑','惊讶','讲解'].map((label,i)=>({id:['01-neutral','02-smile','03-thinking','04-confused','05-surprised','06-explaining'][i],label}))
const now=()=>new Date().toISOString()
const defaultContent:CharacterContent={name:'Aurore',sourceKind:'original',sourceWork:'AF 原创搭档',personality:'温和、好奇，愿意一起寻找答案。',partnerIdentity:'同校的伙伴',userIdentity:'大学生',address:'',background:'现实校园',knowledge:'依据自身经历、被告知与实际查阅的内容回应。',speech:'',relationship:'刚认识不久',initiative:'跟随用户设置',immutable:'',events:'',poses,defaultPose:'01-neutral',sprites:Object.fromEntries(poses.map(p=>[p.id,`character.af-guide.${p.id}`])),examples:true}

export class StoryStore{
 readonly db:DatabaseSync
 constructor(root:string,private resources:Resources){
  const directory=join(root,'data');mkdirSync(directory,{recursive:true});const path=join(directory,'story.sqlite');this.db=new DatabaseSync(path)
  const version=(this.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version
  if(version>1){this.db.close();throw new Error('故事数据来自较新版本，请升级 AF。')}
  if(version<1){this.db.exec('PRAGMA wal_checkpoint(FULL)');if(!existsSync(path+'.backup-v0'))copyFileSync(path,path+'.backup-v0')}
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS story_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   INSERT OR IGNORE INTO story_meta VALUES('version','0');
   CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,removed INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS template_versions(id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,version));
   CREATE TABLE IF NOT EXISTS saves(id TEXT PRIMARY KEY,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS story_commands(key TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL);
   PRAGMA user_version=1;`)
  if(!this.db.prepare('SELECT 1 FROM templates WHERE id=?').get('af-guide')){
   const time=now(),template:CharacterTemplate={id:'af-guide',builtIn:true,templateVersion:1,content:defaultContent,draft:false,createdAt:time,updatedAt:time}
   this.transaction(()=>{this.writeTemplate(template);this.writeSelection({kind:'template',templateId:'af-guide'})})
  }
 }
 close(){this.db.close()}
 version(){return Number((this.db.prepare("SELECT value FROM story_meta WHERE key='version'").get() as {value:string}).value)}
 transaction<T>(fn:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.prepare("UPDATE story_meta SET value=CAST(value AS INTEGER)+1 WHERE key='version'").run();this.db.exec('COMMIT');return value}catch(error){this.db.exec('ROLLBACK');throw error}}
 private template(id:string):CharacterTemplate{const row=this.db.prepare('SELECT data FROM templates WHERE id=? AND removed=0').get(id) as {data:string}|undefined;if(!row)throw new Error('NOT_FOUND');return JSON.parse(row.data)}
 save(id:string):StoryRecord{const row=this.db.prepare('SELECT data FROM saves WHERE id=?').get(id) as {data:string}|undefined;if(!row)throw new Error('NOT_FOUND');return JSON.parse(row.data)}
 selection():StorySelection{const row=this.db.prepare("SELECT value FROM story_meta WHERE key='selection'").get() as {value:string}|undefined;return row?JSON.parse(row.value):{kind:'template',templateId:'af-guide'}}
 private writeSelection(selection:StorySelection){const revision=this.selectionVersion()+1;this.db.prepare("INSERT INTO story_meta VALUES('selectionVersion',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(revision));this.db.prepare("INSERT INTO story_meta VALUES('selection',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(selection))}
 private writeTemplate(t:CharacterTemplate){this.db.prepare('INSERT INTO templates VALUES(?,0,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(t.id,JSON.stringify(t));this.db.prepare('INSERT INTO template_versions VALUES(?,?,?)').run(t.id,t.templateVersion,JSON.stringify(t))}
 writeSave(s:StoryRecord){this.db.prepare('INSERT INTO saves VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(s.id,JSON.stringify(s))}
 private validateContent(content:CharacterContent,draft:boolean){
  if(Buffer.byteLength(JSON.stringify(content))>64*1024*1024)throw new Error('INVALID_PAYLOAD')
  for(const image of Object.values(content.sprites))if(image&&!(image.startsWith('character.')&&this.resources.isRegistered(image))&&!(/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(image)&&this.resources.isValidPng(image)))throw new Error('INVALID_PAYLOAD')
  if(!draft&&(!content.personality.trim()||!content.sprites[content.defaultPose]||content.sourceKind==='existing'&&!content.sourceWork.trim()))throw new Error('INPUT_REQUIRED')
 }
 private page<T>(items:T[],p:{limit?:number;cursor?:string|null}){const offset=p.cursor?Number(p.cursor):0;if(!Number.isSafeInteger(offset)||offset<0)throw new Error('INVALID_PAYLOAD');const limit=p.limit??100;return{items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?String(offset+limit):null}}
 private selectionVersion(){const row=this.db.prepare("SELECT value FROM story_meta WHERE key='selectionVersion'").get() as {value:string}|undefined;return Number(row?.value??0)}
 private commandVersion(command:string,p:any){if(command.startsWith('profile.'))return this.profile().stateVersion;if(command==='selection.get'||command==='template.select')return this.selectionVersion();if(p.saveId)return this.save(p.saveId).stateVersion;if(p.id)return this.template(p.id).templateVersion;return this.version()}
 request(raw:unknown):StoryResponse{
  let request:StoryRequest|undefined,stateVersion:number|null=null
  try{
   request=storyRequestSchema.parse(raw)
   if(!Object.hasOwn(storyCommandSchemas,request.command))throw new Error('INVALID_PAYLOAD')
   const command=request.command as keyof typeof storyCommandSchemas,p=storyCommandSchemas[command].parse(request.payload) as any,read=storyReads.has(command)
   const kind=command.startsWith('template.')?'template':command.startsWith('save.')?'save':command.startsWith('profile.')?'profile':'selection',id=p.id??p.saveId??null
   if(request.target.kind!==kind||request.target.id!==id||request.saveId!==(p.saveId??null)||request.branchId!==(p.branchId??null))throw new Error('FORBIDDEN')
   if(read?request.idempotencyKey!==null:!request.idempotencyKey)throw new Error('INVALID_PAYLOAD')
   // Authorize ownership before replaying an accepted intent; deleted-save receipts remain target-scoped.
   if(p.saveId&&command!=='save.delete')this.save(p.saveId)
   if(p.id&&command!=='template.delete')this.template(p.id)
   if(read){stateVersion=this.commandVersion(command,p);return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion,data:this.dispatch(command,p)}}
   const hash=createHash('sha256').update(JSON.stringify({command,target:request.target,saveId:request.saveId,branchId:request.branchId,payload:p})).digest('hex')
   const prior=this.db.prepare('SELECT hash,result FROM story_commands WHERE key=?').get(request.idempotencyKey!) as {hash:string;result:string}|undefined
   if(prior){if(prior.hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');const receipt=JSON.parse(prior.result);return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:receipt.receiptVersion===2?receipt.stateVersion:this.version(),data:receipt.receiptVersion===2?receipt.data:receipt}}
   const creating=command.endsWith('.create');stateVersion=creating?null:this.commandVersion(command,p)
   if(request.expectedStateVersion!==stateVersion)throw new Error('STALE_STATE')
   const receipt=this.transaction(()=>{const data=this.dispatch(command,p);const version=command.endsWith('.delete')?stateVersion!+1:creating?(command==='save.create'?(data as StoryRecord).stateVersion:(data as CharacterTemplate).templateVersion):this.commandVersion(command,p);const result={receiptVersion:2,data,stateVersion:version};this.db.prepare('INSERT INTO story_commands VALUES(?,?,?)').run(request!.idempotencyKey!,hash,JSON.stringify(result));return result})
   return{protocolVersion:1,requestId:request.requestId,ok:true,stateVersion:receipt.stateVersion,data:receipt.data}
  }catch(error){
   const code=error instanceof z.ZodError?'INVALID_PAYLOAD':error instanceof Error&&['INVALID_PAYLOAD','FORBIDDEN','NOT_FOUND','IDEMPOTENCY_CONFLICT','STALE_STATE','INPUT_REQUIRED'].includes(error.message)?error.message:'RUNTIME_UNAVAILABLE'
   const message:Record<string,string>={INVALID_PAYLOAD:'输入内容或资源无效，请检查后重试。',FORBIDDEN:'此操作不允许，原数据未改变。',NOT_FOUND:'目标已不存在，请刷新。',IDEMPOTENCY_CONFLICT:'同一操作标识不能使用不同参数。',STALE_STATE:'资料版本已变化，请刷新后重新确认。',INPUT_REQUIRED:'请先完成人设、来源与默认立绘，草稿不能创建故事。',RUNTIME_UNAVAILABLE:'故事数据服务暂时不可用，请保留原数据后重试。'}
   return{protocolVersion:1,requestId:request?.requestId??'',ok:false,stateVersion,error:{code,message:message[code],retryable:code==='RUNTIME_UNAVAILABLE',detailsRef:null}}
  }
 }
 profile():UserProfile{const row=this.db.prepare("SELECT value FROM story_meta WHERE key='profile'").get() as {value:string}|undefined;return row?JSON.parse(row.value):{displayName:'我',preferredAddress:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,textScale:1,reducedMotion:false,stateVersion:0}}
 private dispatch(command:keyof typeof storyCommandSchemas,p:any):unknown{
  switch(command){
   case 'profile.get':return this.profile()
   case 'profile.update':{const profile={...this.profile(),...p.patch,stateVersion:this.profile().stateVersion+1};profile.displayName=profile.displayName.trim();profile.preferredAddress=profile.preferredAddress.trim();this.db.prepare("INSERT INTO story_meta VALUES('profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(profile));return profile}
   case 'template.list':return this.page((this.db.prepare('SELECT data FROM templates WHERE removed=0 ORDER BY rowid').all() as {data:string}[]).map(r=>JSON.parse(r.data)),p)
   case 'template.get':return this.template(p.id)
   case 'template.create':{this.validateContent(p.content,p.draft);const time=now(),t:CharacterTemplate={id:randomUUID(),builtIn:false,templateVersion:1,content:{...p.content,name:p.content.name.trim()},draft:p.draft,createdAt:time,updatedAt:time};this.writeTemplate(t);return t}
   case 'template.update':{const old=this.template(p.id);if(old.builtIn)throw new Error('FORBIDDEN');if(p.templateVersion!==old.templateVersion)throw new Error('STALE_STATE');this.validateContent(p.content,p.draft);const next={...old,content:{...p.content,name:p.content.name.trim()},draft:p.draft,templateVersion:old.templateVersion+1,updatedAt:now()};this.writeTemplate(next);if(next.draft&&this.selection().kind==='template'&&(this.selection() as {templateId:string}).templateId===next.id)this.writeSelection({kind:'template',templateId:'af-guide'});return next}
   case 'template.delete':{const old=this.template(p.id);if(old.builtIn)throw new Error('FORBIDDEN');if(old.content.name!==p.confirmedName)throw new Error('INVALID_PAYLOAD');this.db.prepare('UPDATE templates SET removed=1 WHERE id=?').run(old.id);const selected=this.selection();if(selected.kind==='template'&&selected.templateId===old.id)this.writeSelection({kind:'template',templateId:'af-guide'});return{deletedId:old.id}}
   case 'template.select':{const t=this.template(p.id);if(t.draft)throw new Error('INPUT_REQUIRED');this.validateContent(t.content,false);this.writeSelection({kind:'template',templateId:t.id});return this.selection()}
   case 'selection.get':return this.selection()
   case 'save.list':return this.page((this.db.prepare("SELECT data FROM saves ORDER BY json_extract(data,'$.updatedAt') DESC,rowid DESC").all() as {data:string}[]).map(r=>{const {characterSnapshot,...s}=JSON.parse(r.data) as StoryRecord;return{...s,partnerName:characterSnapshot.content.name} satisfies StorySummary}),p)
   case 'save.get':return this.save(p.saveId)
   case 'save.create':{const t=this.template(p.characterTemplateId);if(t.templateVersion!==p.characterTemplateVersion)throw new Error('STALE_STATE');if(t.draft)throw new Error('INPUT_REQUIRED');this.validateContent(t.content,false);if(p.courseIds.some((id:string)=>!this.resources.courseExists(id)))throw new Error('NOT_FOUND');const time=now(),s:StoryRecord={id:randomUUID(),name:p.name.trim(),branchId:randomUUID(),characterTemplateId:t.id,characterTemplateVersion:t.templateVersion,characterSnapshot:{...t,content:{...t.content,background:p.worldSetting.description,partnerIdentity:p.partnerIdentity,userIdentity:p.userIdentity,relationship:p.relationshipStart}},worldSetting:p.worldSetting,partnerIdentity:p.partnerIdentity,userIdentity:p.userIdentity,relationshipStart:p.relationshipStart,courseIds:[...new Set(p.courseIds)] as string[],stateVersion:0,contextRevision:0,createdAt:time,updatedAt:time,chapter:'0-0',chapterName:'全新的起点',lastLine:''};this.writeSave(s);return s}
   case 'save.activate':{const s=this.save(p.saveId);if(s.branchId!==p.branchId)throw new Error('FORBIDDEN');this.validateContent(s.characterSnapshot.content,false);this.writeSelection({kind:'save',saveId:s.id,branchId:s.branchId});return s}
   case 'save.rename':{const s=this.save(p.saveId);this.writeSave({...s,name:p.name.trim(),stateVersion:s.stateVersion+1,updatedAt:now()});return this.save(s.id)}
   case 'save.delete':{const s=this.save(p.saveId);if(s.name!==p.confirmedName)throw new Error('INVALID_PAYLOAD');this.db.prepare('DELETE FROM saves WHERE id=?').run(s.id);const selected=this.selection();if(selected.kind==='save'&&selected.saveId===s.id)this.writeSelection({kind:'template',templateId:'af-guide'});return{deletedId:s.id}}
  }
 }
}
