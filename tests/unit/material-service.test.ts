import {it,expect,afterEach,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {MaterialRepository} from '../../src/main/modules/resources/repository'
import {MaterialService} from '../../src/main/modules/resources/service'
const cleanup:(()=>void)[]=[]
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()))
function setup(worker:any){const root=mkdtempSync(join(tmpdir(),'af-service-test-')),repo=new MaterialRepository(root);cleanup.push(()=>{repo.close();rmSync(root,{recursive:true,force:true})});const provider={summary:()=>({configured:true,model:'deepseek-flash',baseUrl:'https://api.deepseek.com'}),get:()=>({apiKey:'unit-test',model:'deepseek-flash',baseUrl:'https://api.deepseek.com'})};const service=new MaterialService(repo,provider as any,{parser:'parser',agent:'agent',runtime:root,skill:'assets/skills/resource-ingest/1.0.0/SKILL.md'},worker);cleanup.push(()=>service.dispose());return{repo,service}}
it('cancels the actual name-review worker and never replaces the cancelled terminal state',async()=>{
 let interrupted=false
 const worker=vi.fn((_entry:any,_input:any,signal:AbortSignal)=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>{interrupted=true;reject(new Error('CANCELLED'))},{once:true})))
 const {repo,service}=setup(worker);repo.createCourse('数学分析')
 const task=service.reviewName('数分');await vi.waitFor(()=>expect(worker).toHaveBeenCalled())
 const job=repo.jobs().find(j=>j.purpose==='courseNameReview')!;service.cancel(job.id)
 await expect(task).rejects.toThrow('CANCELLED');expect(interrupted).toBe(true);expect(repo.jobs()[0].status).toBe('cancelled')
})
it('honors textbook document scope and allows explicit reparse of a ready document',async()=>{
 const seen:any[]=[];const worker=vi.fn(async(entry:any,input:any)=>{seen.push(input);if(entry==='parser')return{blocks:[{id:'new',page:1,text:'新解析',kind:'paragraph',quality:'native'}],warnings:[]};return{candidates:[],question:null}})
 const {repo,service}=setup(worker);const course=repo.createCourse('数学分析')
 const a=repo.importFile('a.txt','document',Buffer.from('a')),b=repo.importFile('b.txt','document',Buffer.from('b'))
 for(const doc of [a,b]){repo.assign(doc.id,[course.id],'manual');repo.setBlocks(doc.id,[{id:doc.id,page:1,text:'数学分析',kind:'paragraph',quality:'native'}])}
 await service.textbook(course.id,undefined,false,[a.id]);expect(seen[0].documents.map((d:any)=>d.id)).toEqual([a.id])
 const result=service.process([a.id],{force:true});await vi.waitFor(()=>expect(repo.jobs().find(j=>j.id===result.jobId)?.status).toBe('completed'))
 expect(repo.blocks(a.id)[0].text).toBe('新解析');expect(repo.blocks(a.id,true)).toHaveLength(2)
})
it('retains accepted textbook answers as evidence and rejects invented answer references',async()=>{
 const seen:any[]=[];let request=0
 const worker=vi.fn(async(_entry:any,input:any)=>{seen.push(input.input);request++;if(request===1)return{candidates:[],question:'教材作者和版本是什么？'};const evidence=input.input.answerEvidence;return{candidates:[{title:'数学分析',author:'华东师范大学数学科学学院',publisher:null,edition:'第五版',isbn:null,evidenceBlockIds:[],evidenceInputIds:[evidence[0].inputId],confidence:'explicit'},{title:'未提供的教材',author:null,publisher:null,edition:null,isbn:null,evidenceBlockIds:[],evidenceInputIds:['invented'],confidence:'explicit'}],question:null}})
 const {repo,service}=setup(worker),course=repo.createCourse('数学分析'),doc=repo.importFile('练习.txt','document',Buffer.from('极限练习'))
 repo.assign(doc.id,[course.id],'manual');repo.setBlocks(doc.id,[{id:'exercise',page:1,text:'极限练习',kind:'paragraph',quality:'native'}])
 await service.textbook(course.id,undefined,false,[doc.id])
 const task=service.startTextbook(course.id,undefined,'数学分析 第五版，华东师范大学数学科学学院')
 await vi.waitFor(()=>expect(repo.job(task.jobId).status).toBe('completed'))
 expect(seen[1].answerEvidence[0].text).toContain('第五版')
 const candidates=repo.course(course.id).textbook!.candidates
 expect(candidates).toHaveLength(1);expect(candidates[0]).toMatchObject({edition:'第五版',author:'华东师范大学数学科学学院',confidence:'explicit',evidenceInputIds:[task.jobId]})
})
