import {describe,it,expect} from 'vitest'
import {bufferStatus,paginateNodes,validateActDraft,gradeObjective,validateMath} from '../../src/main/modules/story/experience-validation'
import {questionDraftSchema} from '../../src/shared/schemas/experience'

const node=(text='这是完整的一段对白，包含自然的停顿和独立的语义。')=>({kind:'dialogue' as const,speaker:'partner' as const,blocks:[{kind:'text' as const,text,sourceRefs:[]}],poseTag:null,backgroundId:null,choices:[]})
describe('act completeness and recovery buffer',()=>{
 it('preserves canonical place-name characters in generated story text without changing source data',()=>{
  const raw={title:'梨文正图书馆的午后',nodes:[node('我们去黎文正图书馆吧。')],ending:'actEnd'},result=validateActDraft(raw,new Set(),new Set())
  expect(result.title).toBe('李文正图书馆的午后');expect(result.nodes[0].blocks[0]).toMatchObject({text:'我们去李文正图书馆吧。'});expect(raw.title).toBe('梨文正图书馆的午后')
 })
 it('does not treat current plus four as five subsequent pages',()=>{
  const pages=Array.from({length:5},()=>node());expect(bufferStatus(pages,0,false,'afterInterrupt')).toMatchObject({canPlay:false,validFollowingPages:4})
  expect(bufferStatus([...pages,node()],0,false,'afterInterrupt')).toMatchObject({canPlay:true,validFollowingPages:5})
 })
 it('requires a complete normal act, preserves short endings and stops at choices',()=>{
  const pages=Array.from({length:16},()=>node());expect(bufferStatus(pages,0,false,'normal').canPlay).toBe(false)
  expect(bufferStatus(pages,0,true,'normal').canPlay).toBe(true)
  expect(bufferStatus(pages.slice(0,3),0,true,'afterInterrupt').canPlay).toBe(true)
  const choice={...node('接下来想做什么？'),kind:'choice',choices:[{id:'walk',label:'一起散步'},{id:'read',label:'去看书'}]}
  expect(bufferStatus([node(),choice],0,false,'afterInterrupt')).toMatchObject({canPlay:true,earliestInteractionIndex:1})
  expect(()=>validateActDraft({title:'新的一幕',nodes:pages,ending:'truncated'},new Set(),new Set())).toThrow()
 })
 it('splits dialogue semantically without breaking math or manufacturing blank pages',()=>{
  const pages=paginateNodes([{...node(),blocks:[{kind:'text',text:'这是一个完整的句子。'.repeat(20),sourceRefs:[]},{kind:'math',latex:'x^2+1',display:'block',sourceRefs:[]}]}])
  expect(pages.length).toBeGreaterThan(1);expect(pages.every((p:any)=>p.blocks.length>0)).toBe(true)
  expect(pages.flatMap((p:any)=>p.blocks).filter((b:any)=>b.kind==='math')).toEqual([{kind:'math',latex:'x^2+1',display:'block',sourceRefs:[]}])
 })
 it('keeps the choice boundary only on the final fragment, including math-only prompts',()=>{
  const choice={...node('这是需要完整读完再作决定的情境。'.repeat(12)),kind:'choice' as const,choices:[{id:'yes',label:'继续'},{id:'no',label:'再等等'}]},pages=paginateNodes([choice])
  expect(pages.length).toBeGreaterThan(1);expect(pages.slice(0,-1).every(p=>p.kind!=='choice'&&p.choices.length===0)).toBe(true);expect(pages.at(-1)?.choices).toHaveLength(2)
  const math=paginateNodes([{...choice,blocks:[{kind:'math',latex:'x^2',display:'block',sourceRefs:[]}]}]);expect(math).toHaveLength(1);expect(math[0]).toMatchObject({kind:'choice',choices:choice.choices})
 })
})
describe('frozen objective grading and math validation',()=>{
 it('rejects incompatible answer shapes, missing rubrics and ambiguous choice keys before publication',()=>{
  const ref={documentVersionId:'doc',blockId:'block',page:1,fingerprint:'a'.repeat(64)},base={type:'single',prompt:[{kind:'text',text:'单位是什么？',sourceRefs:[ref]}],choices:[{id:'a',label:'伏特'},{id:'b',label:'安培'}],answer:{choiceIds:['a']},rubric:['单位'],hint:'',explanation:[],sourceRefs:[ref],tolerance:'0'}
  expect(questionDraftSchema.safeParse(base).success).toBe(true)
  for(const value of [{...base,answer:{text:'伏特'}},{...base,answer:{choiceIds:['a','b']}},{...base,choices:[{id:'a',label:'伏特'},{id:'a',label:'安培'}]},{...base,type:'boolean',choices:[]},{...base,type:'explanation',choices:[],answer:{text:'解释'},rubric:[]},{...base,type:'numeric',choices:[],answer:{number:'2',unit:'V'},tolerance:'9'.repeat(500)}])expect(questionDraftSchema.safeParse(value).success).toBe(false)
 })
 it('grades multiple choices as sets and enforces numeric units and tolerance',()=>{
  expect(gradeObjective({type:'multiple',answer:{choiceIds:['a','c']}},{choiceIds:['c','a']})).toMatchObject({correct:true})
  expect(gradeObjective({type:'numeric',answer:{number:'2',unit:'V'},tolerance:'0.01'},{number:'2.005',unit:'V'})).toMatchObject({correct:true})
  expect(gradeObjective({type:'numeric',answer:{number:'2',unit:'V'},tolerance:'0.01'},{number:'2.005',unit:'A'})).toMatchObject({correct:false})
  expect(gradeObjective({type:'numeric',answer:{number:'2',unit:'V'},tolerance:'0.01'},{number:'2005',unit:'mV'})).toMatchObject({correct:true})
  expect(gradeObjective({type:'numeric',answer:{number:'9999999999999999',unit:''},tolerance:'0'},{number:'9999999999999998',unit:''})).toMatchObject({correct:false})
  expect(gradeObjective({type:'short',answer:{text:'解释'}},{text:'解释'})).toBeNull()
 })
 it('separates syntax from mathematical verification and rejects active macros',()=>{
  expect(validateMath('\\frac{1}{2}')).toMatchObject({parseOk:true,mathematicalStatus:'unknown'})
  expect(validateMath('2+3=5')).toMatchObject({parseOk:true,mathematicalStatus:'verified'})
  expect(validateMath('2+3=6')).toMatchObject({parseOk:true,mathematicalStatus:'rejected'})
  expect(validateMath('9999999999999999=9999999999999998')).toMatchObject({parseOk:true,mathematicalStatus:'rejected'})
  expect(validateMath('0.1+0.2=0.3')).toMatchObject({parseOk:true,mathematicalStatus:'verified'})
  expect(validateMath('1=1.000000000001')).toMatchObject({parseOk:true,mathematicalStatus:'rejected'})
  expect(validateMath('\\href{https://bad.test}{x}')).toMatchObject({parseOk:false})
 })
})
