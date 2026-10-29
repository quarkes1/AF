import {builtInCompanion,validateCompanion,type CompanionView} from './model'
import type {StoryView} from '../saves/model'

export interface CompanionSelection {companion:CompanionView;storyId:string|null}
export const cloneCompanion=(value:CompanionView):CompanionView=>({...value,sprites:{...value.sprites},poses:value.poses.map(pose=>({...pose}))})
export const initialSelection=():CompanionSelection=>({companion:cloneCompanion(builtInCompanion),storyId:null})
export function chooseCompanion(value:CompanionView):CompanionSelection|null{
  if(value.draft||validateCompanion(value,false))return null
  return {companion:cloneCompanion(value),storyId:null}
}
export function enterStory(story:StoryView,templates:readonly CompanionView[]):CompanionSelection|null{
  if(story.status!=='ready')return null
  const companion=story.companionSnapshot??templates.find(item=>item.id===story.partnerId)
  if(!companion||companion.id!==story.partnerId)return null
  const selection=chooseCompanion(companion)
  return selection?{...selection,storyId:story.id}:null
}
export function reconcileSelection(selection:CompanionSelection,templates:readonly CompanionView[]):CompanionSelection{
  if(selection.storyId)return selection
  const current=templates.find(item=>item.id===selection.companion.id)
  return current&&chooseCompanion(current)||initialSelection()
}
