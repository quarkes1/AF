import {describe,it,expect} from 'vitest'
import {builtInCompanion,copyCompanion} from '../../src/renderer/pages/companions/model'
import {initialSelection,chooseCompanion,enterStory,reconcileSelection} from '../../src/renderer/pages/companions/selection'
import type {StoryView} from '../../src/renderer/pages/saves/model'

describe('companion selection and saved snapshots',()=>{
  const custom=()=>({...copyCompanion(builtInCompanion,'custom'),name:'自设搭档',defaultPose:'02-smile'})
  it('selects a usable companion and keeps its stable ID and configured default',()=>{
    const next=chooseCompanion(custom())!
    expect(next.companion.id).toBe('custom');expect(next.companion.defaultPose).toBe('02-smile');expect(next.storyId).toBeNull()
    expect(chooseCompanion({...custom(),draft:true})).toBeNull()
  })
  it('restores the story snapshot even when its source template was changed or deleted',()=>{
    const snapshot=custom(),story={id:'story',partnerId:snapshot.id,companionSnapshot:snapshot,status:'ready'} as StoryView
    const selected=enterStory(story,[])
    expect(selected?.companion.name).toBe(snapshot.name);expect(selected?.storyId).toBe('story')
    expect(reconcileSelection(selected!,[{...snapshot,name:'改名模板'}]).companion.name).toBe(snapshot.name)
    expect(selected?.companion).not.toBe(snapshot)
  })
  it('uses stable IDs rather than matching display names and rejects invalid entry',()=>{
    const template=custom(),story={id:'story',partnerId:'custom',partner:template.name,status:'ready'} as StoryView
    expect(enterStory(story,[template])?.companion.id).toBe('custom')
    expect(enterStory({...story,partnerId:'missing'},[template])).toBeNull()
    expect(enterStory({...story,status:'corrupt'},[template])).toBeNull()
    expect(enterStory({...story,companionSnapshot:{...template,id:'wrong'}},[template])).toBeNull()
  })
  it('refreshes selected templates and falls back safely when an unarchived selection is removed',()=>{
    const state=chooseCompanion(custom())!
    expect(reconcileSelection(state,[{...custom(),name:'新名字'}]).companion.name).toBe('新名字')
    expect(reconcileSelection(state,[]).companion.id).toBe(initialSelection().companion.id)
  })
})
