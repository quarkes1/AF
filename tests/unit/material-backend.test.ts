import {describe,it,expect,afterEach} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MaterialRepository} from '../../src/main/modules/resources/repository'

const roots:string[]=[]
const connections:MaterialRepository[]=[]
afterEach(()=>{for(const connection of connections.splice(0))try{connection.close()}catch{/* A test may already have closed this connection. */}for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function repository(){const root=mkdtempSync(join(tmpdir(),'af-material-test-'));roots.push(root);const repo=new MaterialRepository(root);connections.push(repo);return repo}
describe('persistent materials and course identity',()=>{
  it('deduplicates byte-identical files, keeps original bytes and restores after restart',()=>{
    const repo=repository();const one=repo.importFile('数分.txt','document',Buffer.from('第一章 极限与连续'))
    const two=repo.importFile('另一个名字.txt','document',Buffer.from('第一章 极限与连续'))
    expect(two.id).toBe(one.id);expect(repo.list()).toHaveLength(1)
    expect(repo.bytes(one.id).toString()).toBe('第一章 极限与连续')
    const root=repo.root;repo.close();const restored=new MaterialRepository(root)
    expect(restored.list()[0].id).toBe(one.id);restored.close()
  })
  it('reuses confirmed aliases and protects explicit separate courses and manual overrides',()=>{
    const repo=repository();const math=repo.createCourse('数学分析');repo.addAlias(math.id,'数分')
    expect(repo.findCourse(' 数分 ')?.id).toBe(math.id)
    const higher=repo.createCourse('高等数学');repo.separateCourses(math.id,higher.id)
    expect(repo.areSeparate(math.id,higher.id)).toBe(true)
    const file=repo.importFile('习题.txt','document',Buffer.from('极限'))
    repo.assign(file.id,[math.id],'manual');repo.assign(file.id,[higher.id],'automatic')
    expect(repo.list()[0].courseIds).toEqual([math.id]);expect(repo.list()[0].manualOverride).toBe(true)
    repo.close()
  })
  it('only retrieves current, visible source blocks and retains unlinked bytes',()=>{
    const repo=repository();const file=repo.importFile('教材.txt','document',Buffer.from('导数是局部变化率'))
    repo.setBlocks(file.id,[{id:'b1',page:1,text:'导数是局部变化率',kind:'paragraph',quality:'native'}])
    expect(repo.search('导数').map(x=>x.documentId)).toEqual([file.id])
    repo.remove(file.id);expect(repo.search('导数')).toEqual([]);expect(repo.bytes(file.id).length).toBeGreaterThan(0)
    repo.close()
  })
  it('preserves prior block anchors when a document is reparsed',()=>{
    const repo=repository();const doc=repo.importFile('版本.txt','document',Buffer.from('第一版'))
    repo.setBlocks(doc.id,[{id:'old-block',page:1,text:'旧解析证据',kind:'paragraph',quality:'native'}])
    repo.setBlocks(doc.id,[{id:'new-block',page:1,text:'新解析证据',kind:'paragraph',quality:'native'}])
    expect(repo.blocks(doc.id).map(b=>b.id)).toEqual(['new-block'])
    expect(repo.blocks(doc.id,true).some(b=>b.id==='old-block')).toBe(true)
    expect(repo.search('旧解析证据').map(b=>b.id)).not.toContain('old-block');repo.close()
  })
  it('restores deleted managed bytes on reimport and retains historical anchors after unlink',()=>{
    const repo=repository(),bytes=Buffer.from('不能丢失的原件'),doc=repo.importFile('原件.txt','document',bytes)
    repo.setBlocks(doc.id,[{id:'history-anchor',page:1,text:'原证据',kind:'paragraph',quality:'native'}])
    repo.remove(doc.id,true);repo.importFile('重新导入.txt','document',bytes)
    expect(repo.bytes(doc.id).equals(bytes)).toBe(true)
    repo.remove(doc.id);expect(repo.blocks(doc.id,true)[0].id).toBe('history-anchor');repo.close()
  })
})
