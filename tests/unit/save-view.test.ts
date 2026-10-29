import { describe,expect,it } from 'vitest'
import { paginate,renameError,canResume,sortStories,type StoryView } from '../../src/renderer/pages/saves/model'

describe('save browser view rules',()=>{
  it('orders all companions by last modification without mutating input and leaves unknown dates last',()=>{
    const entries=[
      {id:'old',partner:'A',savedAt:'2026-10-01T00:00:00Z'},
      {id:'new',partner:'B',savedAt:'2026-10-03T00:00:00Z'},
      {id:'edited',partner:'A',savedAt:'2026-09-01T00:00:00Z',modifiedAt:'2026-10-04T00:00:00Z'},
      {id:'invalid',savedAt:'unknown'},
    ] as StoryView[]
    expect(sortStories(entries).map(s=>s.id)).toEqual(['edited','new','old','invalid'])
    expect(entries[0].id).toBe('old')
    expect(sortStories([...entries, {...entries[1],id:'tie'}]).map(s=>s.id)).toEqual(['edited','new','tie','old','invalid'])
  })
  it('derives page count from real entries and reserves an available create slot',()=>{
    expect(paginate([],0,true)).toMatchObject({page:0,pages:1,items:[]})
    expect(paginate([1,2,3,4,5,6],0,true).pages).toBe(2)
    expect(paginate([1,2,3,4,5,6,7],1,true).items).toEqual([7])
    expect(paginate([1],5,true)).toMatchObject({page:0,pages:1,items:[1]})
    expect(paginate([1,2,3,4,5,6],0,false).pages).toBe(1)
  })
  it('validates renamed titles in graphemes and rejects blank text',()=>{
    expect(renameError('   ')).toBeTruthy()
    expect(renameError('e\u0301'.repeat(64))).toBeNull()
    expect(renameError('字'.repeat(65))).toBeTruthy()
  })
  it('blocks corrupt or migrating records while allowing a usable story without its source files',()=>{
    for(const status of ['corrupt','migrating'])expect(canResume({status} as StoryView)).toBe(false)
    expect(canResume({status:'ready',sourceMissing:true} as StoryView)).toBe(true)
  })
})
