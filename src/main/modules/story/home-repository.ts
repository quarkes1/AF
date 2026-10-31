import {randomUUID} from 'node:crypto'
import type {StoryStore} from './store'
import type {CharacterContextBundle,ChatMessage,ChatScope,HomeAnchor,HomeJob,HomePage,PresentationReceiptInput} from '../../../shared/contracts/home-chat'
import {graphemeCount,graphemePrefix} from '../../../shared/graphemes'
import {dialogueResultSchema} from '../../../shared/schemas/home-chat'
import {normalizeNarrativeNames} from '../../../shared/narrative-language'

import {contentHash} from '../../infrastructure/digest'
export {contentHash} from '../../infrastructure/digest'
const timestamp=()=>new Date().toISOString()
interface Turn{turnId:string;scope:ChatScope;input:ChatMessage;contextRevision:number;attempts:number;channel?:'home'|'story'|'learning'}
export class HomeRepository{
 constructor(readonly store:StoryStore){
  store.db.exec(`
   CREATE TABLE IF NOT EXISTS home_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,branch_id TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS home_turns(id TEXT PRIMARY KEY,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,branch_id TEXT NOT NULL,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS home_jobs(id TEXT PRIMARY KEY,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,branch_id TEXT NOT NULL,turn_id TEXT NOT NULL REFERENCES home_turns(id) ON DELETE CASCADE,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS home_bundles(job_id TEXT PRIMARY KEY REFERENCES home_jobs(id) ON DELETE CASCADE,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS home_replies(id TEXT PRIMARY KEY,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,branch_id TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES home_jobs(id) ON DELETE CASCADE,state TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS home_pages(id TEXT PRIMARY KEY,reply_id TEXT NOT NULL REFERENCES home_replies(id) ON DELETE CASCADE,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,branch_id TEXT NOT NULL,position INTEGER NOT NULL,data TEXT NOT NULL,revealed INTEGER NOT NULL DEFAULT 0,first_seq INTEGER,last_seq INTEGER,event_id TEXT);
   CREATE TABLE IF NOT EXISTS home_receipts(id TEXT PRIMARY KEY,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,hash TEXT NOT NULL,result TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS home_jobs_scope ON home_jobs(save_id,branch_id);
   CREATE INDEX IF NOT EXISTS home_events_scope ON home_events(save_id,branch_id,seq);
   CREATE TABLE IF NOT EXISTS shared_messages(id TEXT PRIMARY KEY,save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,branch_id TEXT NOT NULL,data TEXT NOT NULL);
  `)
 }
 emit(scope:ChatScope,type:string,data:unknown){const eventId=randomUUID(),result=this.store.db.prepare('INSERT INTO home_events(event_id,save_id,branch_id,type,data,created_at) VALUES(?,?,?,?,?,?)').run(eventId,scope.saveId,scope.branchId,type,JSON.stringify(data),timestamp());return{eventId,seq:Number(result.lastInsertRowid)}}
 assertScope(scope:ChatScope,active=false){const save=this.store.save(scope.saveId);if(save.branchId!==scope.branchId)throw new Error('FORBIDDEN');if(active){const selected=this.store.selection();if(selected.kind!=='save'||selected.saveId!==scope.saveId||selected.branchId!==scope.branchId)throw new Error('FORBIDDEN')}return save}
 jobs(scope?:ChatScope):HomeJob[]{const rows=scope?this.store.db.prepare('SELECT data FROM home_jobs WHERE save_id=? AND branch_id=? ORDER BY rowid DESC').all(scope.saveId,scope.branchId):this.store.db.prepare('SELECT data FROM home_jobs ORDER BY rowid DESC').all();return(rows as {data:string}[]).map(r=>JSON.parse(r.data))}
 job(id:string,scope?:ChatScope):HomeJob{const row=this.store.db.prepare('SELECT data FROM home_jobs WHERE id=?').get(id) as {data:string}|undefined;if(!row)throw new Error('NOT_FOUND');const job:HomeJob=JSON.parse(row.data);if(scope&&(job.saveId!==scope.saveId||job.branchId!==scope.branchId))throw new Error('FORBIDDEN');return job}
 putJob(job:HomeJob){this.store.db.prepare('INSERT INTO home_jobs VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.jobId,job.saveId,job.branchId,job.turnId,JSON.stringify(job))}
 changeJob(id:string,patch:Partial<HomeJob>){const old=this.job(id),next={...old,...patch,stateVersion:old.stateVersion+1};this.putJob(next);return next}
 turn(id:string):Turn{const row=this.store.db.prepare('SELECT data FROM home_turns WHERE id=?').get(id) as {data:string}|undefined;if(!row)throw new Error('NOT_FOUND');return JSON.parse(row.data)}
 latestTurn(scope:ChatScope){const rows=this.store.db.prepare('SELECT data FROM home_turns WHERE save_id=? AND branch_id=? ORDER BY rowid DESC').all(scope.saveId,scope.branchId) as {data:string}[];return rows.map(r=>JSON.parse(r.data) as Turn).find(t=>(t.channel??'home')==='home')??null}
 createTurn(scope:ChatScope,text:string,channel:'home'|'story'|'learning'='home'){const save=this.assertScope(scope,true),turnId=randomUUID(),event=this.emit(scope,'input.accepted',{turnId,channel}),input:ChatMessage={id:event.eventId,seq:event.seq,role:'user',name:this.store.profile().displayName,text,createdAt:timestamp(),sourceEventIds:[event.eventId]};const turn:Turn={turnId,scope,input,contextRevision:(channel==='home'?(save.homeContextRevision??save.contextRevision):save.contextRevision)+1,attempts:0,channel};this.store.writeSave({...save,...channel==='home'?{homeContextRevision:turn.contextRevision}:{contextRevision:turn.contextRevision,updatedAt:timestamp(),lastLine:text},stateVersion:save.stateVersion+1});this.store.db.prepare('INSERT INTO home_turns VALUES(?,?,?,?)').run(turnId,scope.saveId,scope.branchId,JSON.stringify(turn));return turn}
 shared(scope:ChatScope,id:string,name:string,text:string,role:'user'|'assistant'='assistant'){
  const prior=this.store.db.prepare('SELECT data FROM shared_messages WHERE id=?').get(id) as {data:string}|undefined,old=prior?JSON.parse(prior.data) as ChatMessage:null
  const event=this.emit(scope,'view.presented',{messageId:id}),message:ChatMessage={id,seq:old?.seq??event.seq,role,name,text,createdAt:old?.createdAt??timestamp(),sourceEventIds:[event.eventId]}
  this.store.db.prepare('INSERT INTO shared_messages VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id,scope.saveId,scope.branchId,JSON.stringify(message));return message
 }
 history(scope:ChatScope,before:number|null=null,limit=100,channel:'all'|'home'|'story'='all'):ChatMessage[]{
  this.assertScope(scope)
  const users=(this.store.db.prepare('SELECT data FROM home_turns WHERE save_id=? AND branch_id=?').all(scope.saveId,scope.branchId) as {data:string}[]).map(r=>JSON.parse(r.data) as Turn).filter(t=>channel==='all'||(channel==='home'?((t.channel??'home')==='home'):((t.channel??'home')!=='home'))).map(t=>t.input)
  const pages=this.store.db.prepare('SELECT p.*,r.job_id FROM home_pages p JOIN home_replies r ON p.reply_id=r.id WHERE p.save_id=? AND p.branch_id=? AND p.revealed>0 ORDER BY p.position').all(scope.saveId,scope.branchId) as {reply_id:string;data:string;revealed:number;first_seq:number;last_seq:number;event_id:string;job_id:string}[]
  const replies=new Map<string,ChatMessage>()
  for(const p of pages){const page=JSON.parse(p.data) as HomePage;let message=replies.get(p.reply_id);if(!message){message={id:p.reply_id,seq:p.first_seq,role:'assistant',name:this.store.save(scope.saveId).characterSnapshot.content.name,text:'',createdAt:this.job(p.job_id).createdAt,sourceEventIds:[]};replies.set(p.reply_id,message)}message.text+=(message.text?'\n':'')+graphemePrefix(page.text,p.revealed);message.seq=Math.min(message.seq,p.first_seq);message.sourceEventIds.push(p.event_id)}
  const shared=(this.store.db.prepare('SELECT data FROM shared_messages WHERE save_id=? AND branch_id=?').all(scope.saveId,scope.branchId) as {data:string}[]).map(r=>JSON.parse(r.data) as ChatMessage)
  return [...users,...channel==='story'?[]:[...replies.values()],...channel==='home'?[]:shared].filter(m=>before===null||m.seq<before).sort((a,b)=>a.seq-b.seq).slice(-limit)
 }
 createJob(turn:Turn,epoch:string,providerFingerprint:string):HomeJob{
  if(turn.attempts>=3)throw new Error('INPUT_REQUIRED')
  turn.attempts++;this.store.db.prepare('UPDATE home_turns SET data=? WHERE id=?').run(JSON.stringify(turn),turn.turnId)
  const job:HomeJob={jobId:randomUUID(),turnId:turn.turnId,taskId:randomUUID(),taskRevision:1,sessionId:randomUUID(),runtimeEpoch:epoch,...turn.scope,contextRevision:turn.contextRevision,status:'queued',stage:'collecting',stateVersion:0,attempt:turn.attempts,createdAt:timestamp(),cancelRequestedAt:null,error:null,resultRef:null,profileVersion:this.store.profile().stateVersion,providerFingerprint}
  this.putJob(job);this.emit(turn.scope,'task.queued',{jobId:job.jobId,taskId:job.taskId,taskRevision:1});return job
 }
 bundle(job:HomeJob):CharacterContextBundle{
  const scope={saveId:job.saveId,branchId:job.branchId},save=this.assertScope(scope),turn=this.turn(job.turnId),content=save.characterSnapshot.content
  const {sprites:_,...core}=content
  if(Buffer.byteLength(JSON.stringify(core))>64000)throw new Error('INPUT_REQUIRED')
  const all=this.history(scope,null,200,'home').filter(m=>m.id!==turn.input.id)
  const bounded=(items:ChatMessage[],bytes:number)=>{const out:ChatMessage[]=[];for(const message of [...items].reverse()){const size=Buffer.byteLength(JSON.stringify(message));if(size>bytes)break;bytes-=size;out.unshift(message)}return out}
  const history=bounded(all,16000),recallHistory=bounded(all,64000),sceneMessages=this.history(scope,null,100,'story').filter(m=>m.name==='旁白').slice(-2),storyContext={chapter:save.chapter,title:graphemePrefix(save.chapterName,80),sceneNotes:sceneMessages.map(m=>graphemePrefix(m.text,90))}
  const data:Omit<CharacterContextBundle,'contentHash'>={bundleId:randomUUID(),purpose:'characterDialogue',...scope,actorId:save.characterTemplateId,contextRevision:job.contextRevision,visibleEventCutoff:Number((this.store.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM home_events').get() as {seq:number}).seq),sourceEventIds:[...new Set([...recallHistory.flatMap(m=>m.sourceEventIds),...sceneMessages.flatMap(m=>m.sourceEventIds),turn.input.id])],characterCoreVersion:save.characterTemplateVersion,growthVersion:0,memoryProjectionVersion:job.contextRevision,suppressionVersion:0,documentVersionIds:[],allowedArtifactIds:[],currentInputEventId:turn.input.id,summaryRefs:[],profile:{...core,worldSetting:save.worldSetting},user:this.store.profile(),history,recallHistory,storyContext,currentInput:turn.input,systemTime:timestamp()}
  const bundle={...data,contentHash:contentHash(data)}
  this.store.db.prepare('INSERT INTO home_bundles VALUES(?,?)').run(job.jobId,JSON.stringify(bundle));return bundle
 }
 publish(job:HomeJob,raw:unknown){
  const output=dialogueResultSchema.parse(raw),save=this.assertScope(job),replyId=randomUUID(),actId=randomUUID()
  output.segments=output.segments.map(segment=>({...segment,text:normalizeNarrativeNames(segment.text)}))
  const pages:HomePage[]=output.segments.map((segment,index)=>{const pose=save.characterSnapshot.content.poses.find(p=>p.id===segment.poseTag||p.label===segment.poseTag)?.id??save.characterSnapshot.content.defaultPose;const body={actId,nodeId:randomUUID(),pageId:randomUUID(),replyId,scriptRevision:1,paginationVersion:1,index,kind:segment.kind,text:segment.text,poseTag:pose,graphemeCount:graphemeCount(segment.text)};return{...body,contentHash:contentHash(body),revealedGraphemeCount:0}})
  this.store.db.prepare('INSERT INTO home_replies VALUES(?,?,?,?,?)').run(replyId,job.saveId,job.branchId,job.jobId,'ready')
  for(const page of pages)this.store.db.prepare('INSERT INTO home_pages(id,reply_id,save_id,branch_id,position,data) VALUES(?,?,?,?,?,?)').run(page.pageId,replyId,job.saveId,job.branchId,page.index,JSON.stringify(page))
  this.emit(job,'artifact.validated',{artifactId:replyId,jobId:job.jobId,sourceRefs:[],audience:'renderer'});return replyId
 }
 reply(scope:ChatScope){const latest=this.latestTurn(scope);if(!latest)return null;const row=this.store.db.prepare('SELECT r.id,r.state FROM home_replies r JOIN home_jobs j ON r.job_id=j.id WHERE r.save_id=? AND r.branch_id=? AND j.turn_id=? ORDER BY r.rowid DESC LIMIT 1').get(scope.saveId,scope.branchId,latest.turnId) as {id:string;state:string}|undefined;if(!row)return null;if(row.state!=='ready')return{replyId:row.id,pages:[] as HomePage[],stopped:true};const pages=(this.store.db.prepare('SELECT data,revealed FROM home_pages WHERE reply_id=? ORDER BY position').all(row.id) as {data:string;revealed:number}[]).map(r=>({...JSON.parse(r.data) as HomePage,revealedGraphemeCount:r.revealed}));return{replyId:row.id,pages,stopped:row.state!=='ready'}}
 seal(scope:ChatScope){this.store.db.prepare("UPDATE home_replies SET state='sealed' WHERE save_id=? AND branch_id=? AND state='ready'").run(scope.saveId,scope.branchId)}
 present(scope:ChatScope,receipt:PresentationReceiptInput){
  this.assertScope(scope,true)
  const hash=contentHash(receipt),prior=this.store.db.prepare('SELECT hash,result FROM home_receipts WHERE id=? AND save_id=?').get(receipt.receiptId,scope.saveId) as {hash:string;result:string}|undefined
  if(prior){if(prior.hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');return JSON.parse(prior.result)}
  const row=this.store.db.prepare('SELECT p.*,r.state FROM home_pages p JOIN home_replies r ON p.reply_id=r.id WHERE p.id=? AND p.save_id=? AND p.branch_id=?').get(receipt.pageId,scope.saveId,scope.branchId) as {data:string;revealed:number;state:string;first_seq:number|null}|undefined
  if(!row)throw new Error('FORBIDDEN')
  const page=JSON.parse(row.data) as HomePage
  if(row.state!=='ready'||receipt.actId!==page.actId||receipt.nodeId!==page.nodeId||receipt.scriptRevision!==page.scriptRevision||receipt.paginationVersion!==page.paginationVersion)throw new Error('CONTEXT_STALE')
  if(receipt.revealedGraphemeCount>page.graphemeCount)throw new Error('INVALID_PAYLOAD')
  const preceding=this.store.db.prepare('SELECT data,revealed FROM home_pages WHERE reply_id=? AND position<?').all(page.replyId,page.index) as {data:string;revealed:number}[]
  if(receipt.revealedGraphemeCount>0&&preceding.some(p=>p.revealed<(JSON.parse(p.data) as HomePage).graphemeCount))throw new Error('BUFFER_NOT_READY')
  const prefix=Math.max(row.revealed,receipt.revealedGraphemeCount)
  if(prefix>row.revealed){
   const event=this.emit(scope,'view.presented',{pageId:page.pageId,artifactId:page.replyId,revealedGraphemeCount:prefix,channel:'home'})
   this.store.db.prepare('UPDATE home_pages SET revealed=?,first_seq=COALESCE(first_seq,?),last_seq=?,event_id=? WHERE id=?').run(prefix,event.seq,event.seq,event.eventId,page.pageId)
   const save=this.store.save(scope.saveId);this.store.writeSave({...save,stateVersion:save.stateVersion+1})
  }
  const result={acceptedReceiptId:receipt.receiptId,cursor:{pageId:page.pageId,revealedGraphemeCount:prefix},stateVersion:this.store.save(scope.saveId).stateVersion}
  this.store.db.prepare('INSERT INTO home_receipts VALUES(?,?,?,?)').run(receipt.receiptId,scope.saveId,hash,JSON.stringify(result));return result
 }
 anchor(scope:ChatScope,anchor:HomeAnchor|null){if(anchor)this.present(scope,{...anchor,receiptId:randomUUID(),channel:'home'})}
 stop(scope:ChatScope,anchor:HomeAnchor|null){this.anchor(scope,anchor);this.store.db.prepare("UPDATE home_replies SET state='stopped' WHERE save_id=? AND branch_id=? AND state='ready'").run(scope.saveId,scope.branchId)}
}
