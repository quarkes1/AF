import {it,expect,afterEach,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {MaterialRepository} from '../../src/main/modules/resources/repository'
import {MaterialService} from '../../src/main/modules/resources/service'

const cleanup:(()=>void)[]=[]
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()))
function setup(worker:any){
 const root=mkdtempSync(join(tmpdir(),'af-classification-')),repo=new MaterialRepository(root)
 cleanup.push(()=>{repo.close();rmSync(root,{recursive:true,force:true})})
 const provider={summary:()=>({configured:true}),get:()=>({apiKey:'test',model:'deepseek-flash',baseUrl:'https://api.deepseek.com'})}
 const service=new MaterialService(repo,provider as any,{parser:'parser',agent:'agent',runtime:root,skill:'assets/skills/resource-ingest/1.0.0/SKILL.md'},worker)
 cleanup.push(()=>service.dispose())
 const document=(filename:string,text:string)=>{const doc=repo.importFile(filename,'document',Buffer.from(text));repo.setBlocks(doc.id,[{id:doc.id+'-block',page:1,text,kind:'paragraph',quality:'native'}]);return doc.id}
 const finish=async(id:string)=>{await vi.waitFor(()=>expect(['completed','failed','cancelled']).toContain(repo.job(id).status));return repo.job(id)}
 return{repo,service,document,finish}
}
function proposal(doc:any,name:string,basis='course'){return{documentId:doc.id,name,categoryBasis:basis,materialType:basis==='topic'?'综述论文':'课件',summary:doc.blocks[0].text,topics:[name],evidenceBlockIds:[doc.blocks[0].id],certainty:'supported',reason:'资料内容支持此类别。'}}

it('creates categories from one circuit deck and a topic paper without a pre-existing course label',async()=>{
 const seen:any[]=[]
 const worker=vi.fn(async(_entry:any,input:any)=>{seen.push(input);return input.purpose==='resourceClassify'?{assignments:input.documents.map((doc:any)=>proposal(doc,doc.filename==='deck.txt'?'电路':'脑机接口',doc.filename==='deck.txt'?'course':'topic'))}:{groups:input.input.proposals.map((p:any)=>({documentIds:[p.documentId],courseId:null,name:p.name,reason:'新主题，无需课程标签或第二个文件。'}))}})
 const {repo,service,document,finish}=setup(worker)
 const circuit=document('deck.txt','叠加定理、戴维南与诺顿定理、最大功率传输'),paper=document('paper.txt','脑机接口研究进展：神经信号采集、解码和康复应用')
 repo.transaction(()=>repo.createCourse('化学实验'))
 for(const id of [circuit,paper])expect((await finish(service.classify([id]).jobId)).status).toBe('completed')
 expect(repo.get(circuit).subject).toBe('电路');expect(repo.get(paper).subject).toBe('脑机接口')
 expect((repo.get(paper) as any).contentProfile).toMatchObject({categoryBasis:'topic',materialType:'综述论文'})
 expect(seen[0].catalog).toEqual([]);expect(seen[0].separations).toEqual([])
 expect(seen[1].purpose).toBe('resourceReconcile');expect(seen[1].input.proposals[0].summary).toContain('戴维南')
})

it('reconciles concurrent imports using current category scope, while retaining manual edits',async()=>{
 let first=true
 const worker=vi.fn(async(_entry:any,input:any)=>{
  if(input.purpose==='resourceClassify')return{assignments:input.documents.map((d:any)=>proposal(d,first?'数学分析':'数分'))}
  const existing=input.catalog.find((c:any)=>c.name==='数学分析');if(existing)expect(existing.examples[0].summary).toContain('极限')
  first=false;return{groups:[{documentIds:input.input.proposals.map((p:any)=>p.documentId),courseId:existing?.id??null,name:existing?.name??'数学分析',reason:'内容范围相同，归并同义类名。'}]}
 })
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','极限、连续、导数和积分'),b=document('b.txt','数列极限和函数连续性练习')
 const one=service.classify([a]),two=service.classify([b]);await finish(one.jobId);await finish(two.jobId)
 expect(repo.courses()).toHaveLength(1);expect(repo.get(a).courseIds).toEqual(repo.get(b).courseIds);expect(repo.findCourse('数分')?.id).toBe(repo.get(a).courseIds[0])
 const own=repo.transaction(()=>repo.createCourse('我自己的课程'));repo.transaction(()=>repo.assign(a,[own.id],'manual'))
 await finish(service.classify([a]).jobId);expect(repo.get(a).subject).toBe('我自己的课程')
})

it('rejects invalid reconciliation atomically and ignores late results after a manual correction',async()=>{
 let release:()=>void=()=>{};let invalid=true
 const worker=vi.fn(async(_entry:any,input:any)=>{
  if(input.purpose==='resourceClassify')return{assignments:input.documents.map((d:any)=>proposal(d,'电路'))}
  if(invalid)return{groups:[{documentIds:[input.input.proposals[0].documentId],courseId:null,name:'电路',reason:'有效组'},{documentIds:['foreign'],courseId:null,name:'无关',reason:'越权'}]}
  await new Promise<void>(r=>{release=r});return{groups:[{documentIds:input.input.proposals.map((p:any)=>p.documentId),courseId:null,name:'电路',reason:'分类'}]}
 })
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','戴维南定理')
 expect((await finish(service.classify([a]).jobId)).status).toBe('failed');expect(repo.courses()).toHaveLength(0)
 invalid=false;const job=service.classify([a]);await vi.waitFor(()=>expect(worker).toHaveBeenCalledTimes(5))
 const own=repo.transaction(()=>repo.createCourse('手动类别'));repo.transaction(()=>repo.assign(a,[own.id],'manual'));release();await finish(job.jobId)
 expect(repo.get(a).subject).toBe('手动类别');expect(repo.courses().map(c=>c.name)).toEqual(['手动类别'])
})

it('preserves explicit separation and does not promote unverified OCR into category evidence',async()=>{
 let target=''
 const worker=vi.fn(async(_entry:any,input:any)=>input.purpose==='resourceClassify'?{assignments:input.documents.map((d:any)=>proposal(d,'高等数学'))}:{groups:[{documentIds:input.input.proposals.map((p:any)=>p.documentId),courseId:target,name:'高等数学',reason:'误认为等价'}]})
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','极限与连续'),b=document('b.txt','低质量识别')
 const original=repo.transaction(()=>repo.createCourse('数学分析')),different=repo.transaction(()=>repo.createCourse('高等数学'));target=different.id
 repo.transaction(()=>{repo.separateCourses(original.id,different.id);repo.assign(a,[original.id],'automatic')})
 repo.setBlocks(b,[{id:b+'-review',page:1,text:'低质量识别',kind:'paragraph',quality:'review'}])
 await finish(service.classify([a,b]).jobId)
 expect(repo.get(a).subject).toBe('数学分析');expect(repo.get(a).state).toBe('needs_review');expect(repo.get(b).subject).toBe('')
})

it('cancels reconciliation before any category or profile is committed',async()=>{
 const worker=vi.fn(async(_entry:any,input:any,signal:AbortSignal)=>{if(input.purpose==='resourceClassify')return{assignments:input.documents.map((d:any)=>proposal(d,'电路'))};return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('CANCELLED')),{once:true}))})
 const {repo,service,document,finish}=setup(worker),id=document('deck.txt','叠加定理和戴维南定理'),job=service.classify([id])
 await vi.waitFor(()=>expect(worker).toHaveBeenCalledTimes(2));service.cancel(job.jobId);expect((await finish(job.jobId)).status).toBe('cancelled')
 expect(repo.courses()).toHaveLength(0);expect((repo.get(id) as any).contentProfile).toBeUndefined()
})
it('invalidates content summaries when the source is reparsed',()=>{
 const {repo,document}=setup(vi.fn()),id=document('deck.txt','旧正文')
 repo.transaction(()=>repo.update(id,{contentProfile:{suggestedCategory:'电路',categoryBasis:'course',materialType:'课件',summary:'旧摘要',topics:['电路'],evidenceBlockIds:[id+'-block'],reason:'旧内容'}}))
 repo.setBlocks(id,[{id:'new-block',page:1,text:'新正文',kind:'paragraph',quality:'native'}])
 expect(repo.get(id).contentProfile).toBeUndefined()
})
it('rejects attempts to unite explicitly separated categories through a third category',async()=>{
 const worker=vi.fn(async(_entry:any,input:any)=>input.purpose==='resourceClassify'?{assignments:input.documents.map((d:any)=>proposal(d,'数学'))}:{groups:[{documentIds:input.input.proposals.map((p:any)=>p.documentId),courseId:null,name:'数学',reason:'误合并'}]})
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','数学分析极限'),b=document('b.txt','高等数学极限')
 const left=repo.transaction(()=>repo.createCourse('数学分析')),right=repo.transaction(()=>repo.createCourse('高等数学'))
 repo.transaction(()=>{repo.assign(a,[left.id],'automatic');repo.assign(b,[right.id],'automatic');repo.separateCourses(left.id,right.id)})
 expect((await finish(service.classify([a,b]).jobId)).status).toBe('failed')
 expect(repo.get(a).subject).toBe('数学分析');expect(repo.get(b).subject).toBe('高等数学');expect(repo.courses()).toHaveLength(2)
})
it('never silently reuses an existing name when reconciliation requests a distinct new category',async()=>{
 const worker=vi.fn(async(_entry:any,input:any)=>input.purpose==='resourceClassify'?{assignments:input.documents.map((d:any)=>proposal(d,'实验'))}:{groups:[{documentIds:input.input.proposals.map((p:any)=>p.documentId),courseId:null,name:'实验',reason:'不同范围，需要新类'}]})
 const {repo,service,document,finish}=setup(worker),id=document('new.txt','物理实验')
 repo.transaction(()=>repo.createCourse('实验'))
 expect((await finish(service.classify([id]).jobId)).status).toBe('failed');expect(repo.get(id).courseIds).toEqual([])
})
it('reserves all new canonical names before registering discovery aliases',async()=>{
 const worker=vi.fn(async(_entry:any,input:any)=>input.purpose==='resourceClassify'?{assignments:input.documents.map((d:any,i:number)=>proposal(d,i===0?'数学':'数学研究'))}:{groups:input.input.proposals.map((p:any,i:number)=>({documentIds:[p.documentId],courseId:null,name:i===0?'数学基础':'数学',reason:'不同学习范围'}))})
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','数学基础概念'),b=document('b.txt','数学研究方法')
 await finish(service.classify([a,b]).jobId)
 expect(repo.get(a).subject).toBe('数学基础');expect(repo.get(b).subject).toBe('数学');expect(repo.courses()).toHaveLength(2)
})
it('retains separation across classification windows and subsequent jobs',async()=>{
 let destination:string|null=null
 const worker=vi.fn(async(_entry:any,input:any)=>input.purpose==='resourceClassify'?{assignments:input.documents.map((d:any)=>proposal(d,'数学主题'))}:{groups:[{documentIds:input.input.proposals.map((p:any)=>p.documentId),courseId:destination,name:'数学主题',reason:'相近主题'}]})
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','数学分析的函数极限'),b=document('b.txt','高等数学的函数极限')
 const left=repo.transaction(()=>repo.createCourse('数学分析')),right=repo.transaction(()=>repo.createCourse('高等数学'))
 repo.transaction(()=>{repo.assign(a,[left.id],'automatic');repo.assign(b,[right.id],'automatic');repo.separateCourses(left.id,right.id)})
 await finish(service.classify([a]).jobId);destination=repo.get(a).courseIds[0]
 await finish(service.classify([b]).jobId)
 expect(repo.get(b).subject).toBe('高等数学');expect(repo.get(b).state).toBe('needs_review');expect(repo.areSeparate(destination!,right.id)).toBe(true)
})
it('keeps genuinely unsupported documents for review without failing the whole batch',async()=>{
 const worker=vi.fn(async(_entry:any,input:any)=>({assignments:input.documents.map((d:any,i:number)=>({...proposal(d,'未知'),certainty:i===0?'uncertain':'supported',evidenceBlockIds:[]}))}))
 const {repo,service,document,finish}=setup(worker),a=document('a.txt','内容不完整'),b=document('b.txt','只有作者姓名')
 expect((await finish(service.classify([a,b]).jobId)).status).toBe('completed')
 expect(repo.get(a).state).toBe('needs_review');expect(repo.get(b).state).toBe('needs_review');expect(repo.courses()).toHaveLength(0)
 expect(worker).toHaveBeenCalledTimes(1)
})
