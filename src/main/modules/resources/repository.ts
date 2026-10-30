import {DatabaseSync} from 'node:sqlite'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,unlinkSync,copyFileSync} from 'node:fs'
import {join,extname} from 'node:path'
import type {ContentBlock,CourseRecord,MaterialJob,MaterialKind,MaterialRecord,TextbookState} from '../../../shared/contracts/materials'

export const normalizeCourse=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,'').toLocaleLowerCase()
export class MaterialRepository{
  readonly db:DatabaseSync
  private inTransaction=false
  private afterCommit:(()=>void)[]=[]
  constructor(readonly root:string){
    mkdirSync(join(root,'data'),{recursive:true});mkdirSync(join(root,'imports'),{recursive:true})
    this.db=new DatabaseSync(join(root,'data','materials.sqlite'))
    const previousVersion=(this.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version
    if(previousVersion>2){this.db.close();throw new Error('资料库由较新版本的 AF 创建，请升级后打开。')}
    if(previousVersion<2){this.db.exec('PRAGMA wal_checkpoint(FULL)');const backup=join(root,'data',`materials.sqlite.backup-v${previousVersion}`);if(!existsSync(backup))copyFileSync(join(root,'data','materials.sqlite'),backup)}
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES('version','0');
      CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,kind TEXT NOT NULL,removed INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,UNIQUE(fingerprint,kind));
      CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,normalized TEXT NOT NULL UNIQUE,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS aliases(normalized TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id));
      CREATE TABLE IF NOT EXISTS separated(a TEXT NOT NULL,b TEXT NOT NULL,PRIMARY KEY(a,b));
      CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES materials(id),data TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
      CREATE VIRTUAL TABLE IF NOT EXISTS block_search USING fts5(id UNINDEXED,document_id UNINDEXED,terms);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands(key TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS textbook_maps(course_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(course_id,version));
      CREATE TABLE IF NOT EXISTS textbook_answers(course_id TEXT NOT NULL,question_id TEXT NOT NULL,job_id TEXT NOT NULL,answer TEXT NOT NULL,PRIMARY KEY(course_id,question_id));
      `)
    if(!(this.db.prepare('PRAGMA table_info(blocks)').all() as {name:string}[]).some(c=>c.name==='active'))this.db.exec('ALTER TABLE blocks ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
    this.db.exec('PRAGMA user_version=2')
    for(const job of this.jobs())if(['running','queued'].includes(job.status))this.putJob({...job,status:'failed',error:'应用已重启，任务已中断；可重试。'})
  }
  close(){this.db.close()}
  version(){return Number((this.db.prepare("SELECT value FROM meta WHERE key='version'").get() as {value:string}).value)}
  beginIntent(){if(this.inTransaction)throw new Error('事务重入。');this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true}
  commitIntent(){this.db.prepare("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='version'").run();this.db.exec('COMMIT');this.inTransaction=false;const actions=this.afterCommit.splice(0);for(const action of actions)try{action()}catch{/* A retained managed copy is safer than losing committed metadata. */}}
  rollbackIntent(){if(this.inTransaction){this.db.exec('ROLLBACK');this.inTransaction=false;this.afterCommit=[]}}
  transaction<T>(fn:()=>T):T{if(this.inTransaction)return fn();this.beginIntent();try{const r=fn();this.commitIntent();return r}catch(e){this.rollbackIntent();throw e}}
  list():MaterialRecord[]{return (this.db.prepare('SELECT data FROM materials WHERE removed=0 ORDER BY rowid DESC').all() as {data:string}[]).map(r=>JSON.parse(r.data))}
  get(id:string,removed=false):MaterialRecord{const row=this.db.prepare(`SELECT data FROM materials WHERE id=? ${removed?'':'AND removed=0'}`).get(id) as {data:string}|undefined;if(!row)throw new Error('NOT_FOUND');return JSON.parse(row.data)}
  importFile(filename:string,kind:MaterialKind,bytes:Buffer,metadata:Partial<MaterialRecord>={}):MaterialRecord{
    const fingerprint=createHash('sha256').update(bytes).digest('hex')
    const prior=this.db.prepare('SELECT id,removed FROM materials WHERE fingerprint=? AND kind=?').get(fingerprint,kind) as {id:string;removed:number}|undefined
    if(prior){const path=join(this.root,'imports',fingerprint);if(!existsSync(path)){writeFileSync(path+'.tmp',bytes);renameSync(path+'.tmp',path)}if(prior.removed)this.transaction(()=>this.db.prepare('UPDATE materials SET removed=0 WHERE id=?').run(prior.id));return this.get(prior.id)}
    const extension=extname(filename).slice(1).toLowerCase();const id=`user.${kind}.${randomUUID()}`,now=Date.now()
    const item:MaterialRecord={id,kind,name:filename.slice(0,-extension.length-1)||filename,filename,extension,mime:'application/octet-stream',size:bytes.length,addedAt:now,updatedAt:now,subject:'',textbook:'',chapter:'',position:50,courseIds:[],manualOverride:false,state:kind==='document'?'queued':'ready',error:null,blocks:0,classificationEvidence:[],fingerprint,stateVersion:0,...metadata}
    const path=join(this.root,'imports',fingerprint);if(!existsSync(path)){writeFileSync(path+'.tmp',bytes);renameSync(path+'.tmp',path)}
    this.transaction(()=>this.db.prepare('INSERT INTO materials(id,fingerprint,kind,data) VALUES(?,?,?,?)').run(id,fingerprint,kind,JSON.stringify(item)));return item
  }
  bytes(id:string){const item=this.get(id,true);return readFileSync(join(this.root,'imports',item.fingerprint))}
  update(id:string,patch:Partial<MaterialRecord>){const item=this.get(id);const next={...item,...patch,id:item.id,fingerprint:item.fingerprint,stateVersion:item.stateVersion+1,updatedAt:Date.now()};this.db.prepare('UPDATE materials SET data=? WHERE id=?').run(JSON.stringify(next),id);return next}
  remove(id:string,deleteCopy=false){const item=this.get(id);const owned=new Set(this.blocks(id,true).map(b=>b.id));const referenced=(this.db.prepare('SELECT data FROM textbook_maps').all() as {data:string}[]).some(r=>{const map=JSON.parse(r.data) as TextbookState;return map.documentIds?.includes(id)||map.chapters.some(c=>c.blockIds.some(b=>owned.has(b)))});this.transaction(()=>{this.db.prepare('UPDATE materials SET removed=1 WHERE id=?').run(id);if(deleteCopy&&!referenced&&!this.db.prepare('SELECT 1 FROM materials WHERE fingerprint=? AND removed=0').get(item.fingerprint)){const path=join(this.root,'imports',item.fingerprint);this.afterCommit.push(()=>{if(existsSync(path))unlinkSync(path)})}});return{removed:true,managedCopyDeletionRequested:deleteCopy,retainedForEvidence:referenced}}
  courses():CourseRecord[]{return (this.db.prepare('SELECT data FROM courses ORDER BY rowid').all() as {data:string}[]).map(row=>JSON.parse(row.data))}
  findCourse(name:string){const normalized=normalizeCourse(name);const row=this.db.prepare('SELECT data FROM courses WHERE normalized=? UNION SELECT c.data FROM courses c JOIN aliases a ON c.id=a.course_id WHERE a.normalized=?').get(normalized,normalized) as {data:string}|undefined;return row?JSON.parse(row.data) as CourseRecord:undefined}
  createCourse(name:string){const prior=this.findCourse(name);if(prior)return prior;const value:CourseRecord={id:randomUUID(),name:name.trim(),aliases:[],stateVersion:0,textbook:null};this.db.prepare('INSERT INTO courses VALUES(?,?,?)').run(value.id,normalizeCourse(name),JSON.stringify(value));return value}
  course(id:string){const value=this.courses().find(x=>x.id===id);if(!value)throw new Error('NOT_FOUND');return value}
  addAlias(id:string,name:string){const current=this.findCourse(name);if(current&&current.id!==id)throw new Error('名称已属于其他科目。');const course=this.course(id);if(normalizeCourse(name)===normalizeCourse(course.name))return;this.db.prepare('INSERT OR IGNORE INTO aliases VALUES(?,?)').run(normalizeCourse(name),id);if(!course.aliases.includes(name))course.aliases.push(name);course.stateVersion++;this.db.prepare('UPDATE courses SET data=? WHERE id=?').run(JSON.stringify(course),id)}
  separateCourses(a:string,b:string){this.course(a);this.course(b);if(a!==b)this.db.prepare('INSERT OR IGNORE INTO separated VALUES(?,?)').run(...[a,b].sort())}
  areSeparate(a:string,b:string){return !!this.db.prepare('SELECT 1 FROM separated WHERE a=? AND b=?').get(...[a,b].sort())}
  separations(){return (this.db.prepare('SELECT a,b FROM separated').all() as {a:string;b:string}[]).map(r=>[r.a,r.b] as [string,string])}
  assign(id:string,courseIds:string[],source:'manual'|'automatic'){const item=this.get(id);if(item.manualOverride&&source==='automatic')return item;const courses=[...new Set(courseIds)].map(id=>this.course(id));return this.update(id,{courseIds:courses.map(x=>x.id),subject:courses.map(x=>x.name).join('、'),manualOverride:source==='manual'})}
  setBlocks(id:string,blocks:ContentBlock[]){this.transaction(()=>{this.get(id);this.db.prepare('UPDATE blocks SET active=0 WHERE document_id=?').run(id);this.db.prepare('DELETE FROM block_search WHERE document_id=?').run(id);for(const b of blocks){this.db.prepare('INSERT INTO blocks(id,document_id,data) VALUES(?,?,?)').run(b.id,id,JSON.stringify(b));this.db.prepare('INSERT INTO block_search VALUES(?,?,?)').run(b.id,id,terms(b.text))}this.update(id,{contentProfile:undefined,blocks:blocks.length,state:blocks.some(b=>b.quality==='review')?'needs_review':'ready',error:null})})}
  blocks(id:string,history=false):ContentBlock[]{this.get(id,history);return (this.db.prepare(`SELECT data FROM blocks WHERE document_id=? ${history?'':'AND active=1'} ORDER BY rowid`).all(id) as {data:string}[]).map(x=>JSON.parse(x.data))}
  search(query:string,courseId?:string){const tokens=terms(query).split(' ').filter(Boolean).slice(0,24);if(!tokens.length)return[];const rows=this.db.prepare('SELECT b.document_id,b.data FROM block_search f JOIN blocks b ON b.id=f.id JOIN materials m ON b.document_id=m.id WHERE block_search MATCH ? AND m.removed=0 ORDER BY rank LIMIT 100').all(tokens.map(t=>'"'+t.replaceAll('"','')+'"').join(' OR ')) as {document_id:string;data:string}[];return rows.filter(r=>!courseId||this.get(r.document_id).courseIds.includes(courseId)).map(r=>({documentId:r.document_id,...JSON.parse(r.data) as ContentBlock})).slice(0,20)}
  setTextbook(id:string,value:TextbookState){const c=this.course(id);this.db.prepare('INSERT INTO textbook_maps VALUES(?,?,?)').run(id,value.chapterMapVersion,JSON.stringify(value));c.textbook=value;c.stateVersion++;this.db.prepare('UPDATE courses SET data=? WHERE id=?').run(JSON.stringify(c),id);return c}
  putJob(job:MaterialJob){this.db.prepare('INSERT INTO jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id,JSON.stringify(job))}
  job(id:string):MaterialJob{const row=this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id) as {data:string}|undefined;if(!row)throw new Error('NOT_FOUND');return JSON.parse(row.data)}
  jobs():MaterialJob[]{return (this.db.prepare("SELECT data FROM jobs ORDER BY CASE WHEN json_extract(data,'$.status') IN ('queued','running','waiting_user') THEN 0 ELSE 1 END,rowid DESC LIMIT 100").all() as {data:string}[]).map(x=>JSON.parse(x.data))}
}
function terms(text:string){return text.normalize('NFKC').toLocaleLowerCase().match(/[\p{Script=Han}]|[\p{L}\p{N}_]+/gu)?.join(' ')??''}
