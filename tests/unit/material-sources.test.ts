import {it,expect,afterEach,vi} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MaterialRepository} from '../../src/main/modules/resources/repository'
import {MaterialService} from '../../src/main/modules/resources/service'
import {SourceService} from '../../src/main/modules/resources/sources'
const cleanup:(()=>void)[]=[]
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()))
it('scans incrementally, requires explicit import, preserves originals and carries manual classification to new versions',async()=>{
 const root=mkdtempSync(join(tmpdir(),'af-sources-test-')),source=join(root,'selected');mkdirSync(source);writeFileSync(join(source,'讲义.md'),'# 极限\n第一版')
 const repo=new MaterialRepository(join(root,'user-data')),provider={summary:()=>({configured:false})}
 const parser=async(_entry:any,input:any)=>({blocks:[{id:input.id,page:1,text:'极限与连续',kind:'paragraph',quality:'native'}],warnings:[]})
 const service=new MaterialService(repo,provider as any,{parser:'parse',agent:'agent',runtime:root,skill:''},parser as any),sources=new SourceService(service)
 cleanup.push(()=>{sources.dispose();service.dispose();repo.close();rmSync(root,{recursive:true,force:true})})
 const grant=await sources.add(source);const scan=sources.scan([grant.id],true)
 await vi.waitFor(()=>expect(repo.job(scan.jobId).status).toBe('completed'))
 expect(repo.list()).toHaveLength(0)
 const files=(repo.job(scan.jobId).result as any).files;expect(files[0].change).toBe('new')
 const imported=sources.importEntries(files.map((f:any)=>f.id));await vi.waitFor(()=>expect(repo.job(imported.jobId).status).toBe('completed'));await vi.waitFor(()=>expect(service.aborts.size).toBe(0))
 const first=repo.list()[0],course=repo.createCourse('数学分析');repo.assign(first.id,[course.id],'manual')
 const same=sources.scan([grant.id],true);await vi.waitFor(()=>expect(repo.job(same.jobId).status).toBe('completed'));expect((repo.job(same.jobId).result as any).files[0].change).toBe('unchanged')
 writeFileSync(join(source,'讲义.md'),'# 极限\n第二版')
 const changed=sources.scan([grant.id],true);await vi.waitFor(()=>expect(repo.job(changed.jobId).status).toBe('completed'));const update=(repo.job(changed.jobId).result as any).files[0];expect(update.change).toBe('updated')
 const next=sources.importEntries([update.id]);await vi.waitFor(()=>expect(repo.job(next.jobId).status).toBe('completed'));await vi.waitFor(()=>expect(service.aborts.size).toBe(0))
 const second=repo.list().find(d=>d.id!==first.id)!;expect(second.manualOverride).toBe(true);expect(second.courseIds).toEqual([course.id]);expect(second.previousVersionId).toBe(first.id)
 expect(readFileSync(join(source,'讲义.md'),'utf8')).toContain('第二版');expect(repo.bytes(first.id).toString()).toContain('第一版')
 const colliding=Buffer.from('已经存在的另一门课程资料'),existing=repo.importFile('保留我的名字.txt','document',colliding),other=repo.createCourse('物理')
 repo.assign(existing.id,[other.id],'manual');writeFileSync(join(source,'讲义.md'),colliding)
 const collisionScan=sources.scan([grant.id],true);await vi.waitFor(()=>expect(repo.job(collisionScan.jobId).status).toBe('completed'))
 const collisionImport=sources.importEntries([(repo.job(collisionScan.jobId).result as any).files[0].id]);await vi.waitFor(()=>expect(repo.job(collisionImport.jobId).status).toBe('completed'));await vi.waitFor(()=>expect(service.aborts.size).toBe(0))
 expect(repo.get(existing.id).name).toBe('保留我的名字');expect(repo.get(existing.id).courseIds).toEqual([other.id])
})
