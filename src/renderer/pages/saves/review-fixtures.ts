import type { StoryView } from './model'
import {builtInCompanion,copyCompanion} from '../companions/model'
import {cloneCompanion} from '../companions/selection'

export const reviewArchiveCompanion={...copyCompanion(builtInCompanion,'review-archive-companion'),name:'演示搭档',defaultPose:'02-smile'}

/** Explicit review mode only: no real saves, screenshots, memories or disk writes. */
export const reviewStories:StoryView[]=[
  ['全新的起点','01-03','ready'],['图书馆的午后','00-05','ready'],['复习前夜','02-01','ready'],
  ['尚未读完的信','01-02','corrupt'],['旧日书页','00-04','migrating'],['走廊里的约定','01-06','ready'],['窗边的留白','02-03','ready'],
].map(([name,chapter,status],i)=>({
  id:`review-story-${i+1}`,name,chapter,chapterName:name,lastLine:i===0?'与你相遇的每一天，都值得珍藏。':i===1?'书页翻过的时候，我们的故事仍将继续。':undefined,status:status as StoryView['status'],partner:i===1?reviewArchiveCompanion.name:'Aurore',partnerId:i===1?reviewArchiveCompanion.id:builtInCompanion.id,companionSnapshot:cloneCompanion(i===1?reviewArchiveCompanion:builtInCompanion),savedAt:`2026-10-${String(26-i).padStart(2,'0')}T19:42:00+08:00`,sourceMissing:i===5,
  checkpoints:i===0?[
    {id:'review-manual-1',name:'图书馆门口',kind:'manual',chapter:'01-02',savedAt:'2026-10-26T19:30:00+08:00',branch:'主线'},
    {id:'review-manual-2',name:'全新的起点',kind:'manual',chapter:'01-03',savedAt:'2026-10-26T19:42:00+08:00',branch:'主线'},
    {id:'review-auto-1',name:'片段结束',kind:'auto',chapter:'01-03',savedAt:'2026-10-26T19:42:00+08:00',branch:'主线'},
    {id:'review-quick-1',name:'临时停留',kind:'quick',chapter:'01-02',savedAt:'2026-10-26T19:35:00+08:00',branch:'主线',corrupt:true},
  ]:[],
}))
