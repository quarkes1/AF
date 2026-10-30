/** Renderer-only view models; these do not replace the shared save service contracts. */
import type {CompanionView} from '../companions/model'
export interface CheckpointView {
  id:string;name:string;kind:'manual'|'auto'|'quick';chapter:string;savedAt:string;branch:string;corrupt?:boolean;thumbnailId?:string
}
export interface StoryView {
  branchId?:string
  id:string;name:string;partner:string;partnerId:string;companionSnapshot?:CompanionView;chapter:string;chapterName?:string;lastLine?:string;savedAt:string;modifiedAt?:string;status:'ready'|'corrupt'|'migrating';sourceMissing?:boolean;thumbnailId?:string;checkpoints:CheckpointView[]
}
export const storyModifiedAt=(story:StoryView)=>story.modifiedAt??story.savedAt
export function sortStories(stories:readonly StoryView[]){
  const time=(story:StoryView)=>{const value=Date.parse(storyModifiedAt(story));return Number.isFinite(value)?value:-Infinity}
  return [...stories].sort((a,b)=>time(b)-time(a))
}
export function paginate<T>(entries:readonly T[],requested:number,createSlot=false){
  const pages=Math.max(1,Math.ceil((entries.length+Number(createSlot))/6))
  const page=Math.max(0,Math.min(pages-1,requested))
  return {page,pages,items:entries.slice(page*6,page*6+6)}
}
export function renameError(value:string):string|null {
  const name=value.trim()
  if(!name)return '请输入故事名称。'
  if([...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(name)].length>64)return '故事名称最多 64 个字。'
  return null
}
export const canResume=(story:StoryView)=>story.status==='ready'
export const displayTime=(value:string)=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replaceAll('/','.'):'时间未知'
