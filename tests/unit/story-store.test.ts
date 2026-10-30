import {it,expect,afterEach} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {StoryStore} from '../../src/main/modules/story/store'

const cleanup:(()=>void)[]=[]
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()))
function setup(){
 const root=mkdtempSync(join(tmpdir(),'af-story-test-'));let store=new StoryStore(root,{isRegistered:id=>id.startsWith('character.af-guide.'),isValidPng:()=>false,courseExists:()=>false})
 cleanup.push(()=>{store.close();rmSync(root,{recursive:true,force:true})})
 const request=(command:string,payload:any={},extra:any={})=>{
  const kind=command.startsWith('template.')?'template':command.startsWith('save.')?'save':'selection'
  let version:number|null=null
  if(!command.endsWith('.create')){
   const read=command==='template.select'||command.startsWith('selection.')?'selection.get':payload.saveId?'save.get':payload.id?'template.get':command
   const readPayload=read==='selection.get'?{}:read.endsWith('.list')?{}:payload.saveId?{saveId:payload.saveId}:{id:payload.id}
   const r=store.request({protocolVersion:1,requestId:randomUUID(),command:read,target:{kind:read.startsWith('selection.')?'selection':kind,id:(readPayload as any).id??(readPayload as any).saveId??null},saveId:(readPayload as any).saveId??null,branchId:null,expectedStateVersion:null,idempotencyKey:null,payload:readPayload})
   version=r.stateVersion
  }
  return store.request({protocolVersion:1,requestId:randomUUID(),command,target:{kind,id:payload.id??payload.saveId??null},saveId:payload.saveId??null,branchId:payload.branchId??null,expectedStateVersion:version,idempotencyKey:command.endsWith('.list')||command.endsWith('.get')?null:randomUUID(),payload,...extra})
 }
 const call=(command:string,payload:any={})=>{const r=request(command,payload);if(!r.ok)throw new Error(r.error.code);return r.data as any}
 const original=()=>call('template.get',{id:'af-guide'})
 const createTemplate=()=>{const source=original();return call('template.create',{content:{...source.content,name:'自设搭档'},draft:false})}
 const createSave=(template:any)=>call('save.create',{name:'新的故事',characterTemplateId:template.id,characterTemplateVersion:template.templateVersion,worldSetting:{mode:'realWorld',description:'现实校园'},partnerIdentity:'同校的伙伴',userIdentity:'大学生',relationshipStart:'刚认识不久',courseIds:[]})
 return{root,call,request,original,createTemplate,createSave,restart:()=>{store.close();store=new StoryStore(root,{isRegistered:id=>id.startsWith('character.af-guide.'),isValidPng:()=>false,courseExists:()=>false})}}
}
it('persists versioned templates and immutable save character snapshots across edits, deletion and restart',()=>{
 const {call,createTemplate,createSave,restart}=setup(),template=createTemplate(),save=createSave(template)
 expect(save.id).not.toBe(template.id);expect(save.branchId).toBeTruthy();expect(save.characterSnapshot.content.name).toBe('自设搭档')
 call('template.update',{id:template.id,templateVersion:template.templateVersion,content:{...template.content,name:'后来改名'},draft:false})
 expect(call('save.get',{saveId:save.id}).characterSnapshot.content.name).toBe('自设搭档')
 call('template.delete',{id:template.id,confirmedName:'后来改名'})
 restart();expect(call('save.get',{saveId:save.id}).characterSnapshot.content.name).toBe('自设搭档');expect(call('template.list').items).toHaveLength(1)
})
it('separates card selection, template selection and save activation and restores active identity after restart',()=>{
 const {call,createTemplate,createSave,restart}=setup(),template=createTemplate(),save=createSave(template)
 expect(call('selection.get')).toMatchObject({kind:'template',templateId:'af-guide'})
 call('save.list');call('save.get',{saveId:save.id});expect(call('selection.get').kind).toBe('template')
 call('save.activate',{saveId:save.id,branchId:save.branchId});restart();expect(call('selection.get')).toMatchObject({kind:'save',saveId:save.id,branchId:save.branchId})
 call('template.select',{id:'af-guide'});expect(call('selection.get')).toMatchObject({kind:'template',templateId:'af-guide'})
})
it('commits idempotency with mutations, rejects payload conflicts and stale versions, and protects built-ins',()=>{
 const {request,original,call}=setup(),key=randomUUID(),content=original().content
 const args={content:{...content,name:'幂等模板'},draft:false},first=request('template.create',args,{idempotencyKey:key})
 const again=request('template.create',args,{idempotencyKey:key,expectedStateVersion:0});expect(again).toMatchObject({ok:true,data:(first as any).data})
 expect(request('template.create',{...args,content:{...content,name:'不同参数'}},{idempotencyKey:key})).toMatchObject({ok:false,error:{code:'IDEMPOTENCY_CONFLICT'}})
 expect(request('template.create',args,{expectedStateVersion:0})).toMatchObject({ok:false,error:{code:'STALE_STATE'}})
 expect(request('template.delete',{id:'af-guide',confirmedName:'Aurore'})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}})
 expect(call('template.list').items).toHaveLength(2)
})
it('rejects drafts, unknown versions, external sprite URLs and foreign branches without half-created saves',()=>{
 const {call,request,original,createTemplate,createSave}=setup(),source=original(),template=createTemplate()
 expect(request('template.create',{content:{...source.content,sprites:{'01-neutral':'https://example.org/p.png'}},draft:false})).toMatchObject({ok:false,error:{code:'INVALID_PAYLOAD'}})
 const draft=call('template.create',{content:{...source.content,name:'草稿',personality:''},draft:true})
 expect(()=>createSave(draft)).toThrow('INPUT_REQUIRED')
 expect(()=>createSave({...template,templateVersion:99})).toThrow('STALE_STATE')
 const save=createSave(template)
 expect(request('save.activate',{saveId:save.id,branchId:randomUUID()})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}})
 expect(call('save.list').items).toHaveLength(1)
})
it('renames and deletes only the named save and resets selection when its active save is removed',()=>{
 const {call,request,createTemplate,createSave}=setup(),template=createTemplate(),a=createSave(template),b=createSave(template)
 call('save.activate',{saveId:a.id,branchId:a.branchId});call('save.rename',{saveId:a.id,name:'改名后'})
 expect(request('save.delete',{saveId:a.id,confirmedName:'新的故事'})).toMatchObject({ok:false,error:{code:'INVALID_PAYLOAD'}})
 call('save.delete',{saveId:a.id,confirmedName:'改名后'});expect(call('save.list').items.map((s:any)=>s.id)).toEqual([b.id]);expect(call('selection.get').kind).toBe('template')
})
it('freezes the identities and world actually chosen for the save without changing the template',()=>{
 const {call,createTemplate}=setup(),template=createTemplate()
 const save=call('save.create',{name:'自定义起点',characterTemplateId:template.id,characterTemplateVersion:template.templateVersion,worldSetting:{mode:'custom',description:'架空校园'},partnerIdentity:'研究伙伴',userIdentity:'旁听生',relationshipStart:'一起参加过活动',courseIds:[]})
 expect(save.characterSnapshot.content).toMatchObject({background:'架空校园',partnerIdentity:'研究伙伴',userIdentity:'旁听生',relationship:'一起参加过活动'})
 expect(call('template.get',{id:template.id}).content.userIdentity).toBe('大学生')
})
it('checks a save aggregate version rather than unrelated template or save writes',()=>{
 const {call,request,createTemplate,createSave}=setup(),template=createTemplate(),a=createSave(template),b=createSave(template)
 call('save.rename',{saveId:b.id,name:'另一个故事'})
 expect(request('save.rename',{saveId:a.id,name:'独立版本'},{expectedStateVersion:a.stateVersion})).toMatchObject({ok:true,stateVersion:a.stateVersion+1})
 expect(request('save.rename',{saveId:a.id,name:'过时编辑'},{expectedStateVersion:a.stateVersion})).toMatchObject({ok:false,error:{code:'STALE_STATE'}})
})
