import type {CourseRecord,MaterialRecord,ContentBlock} from '../../../shared/contracts/materials'
import type {CourseSource} from '../../../shared/contracts/experience'

import {courseOutline} from '../../../shared/learning-outline'
export {courseOutline} from '../../../shared/learning-outline'

export function buildCourseSource(course:CourseRecord,documents:MaterialRecord[],blocks:(id:string)=>ContentBlock[],chapterId:string,version:number):CourseSource{
 const outline=courseOutline(course,documents);if(version!==outline.chapterMapVersion)throw new Error('CONTEXT_STALE')
 const chapter=outline.chapters.find(c=>c.chapterId===chapterId);if(!chapter)throw new Error('NOT_FOUND')
 const allowed=documents.filter(d=>chapter.documentIds.includes(d.id)&&d.courseIds.includes(course.id)&&d.blocks>0)
 const selected=allowed.flatMap(document=>{const all=blocks(document.id);if(!chapter.blockIds.length)return all.map(b=>({document,b}));const starts=all.map((b,i)=>chapter.blockIds.includes(b.id)?i:-1).filter(i=>i>=0);return starts.flatMap(start=>{let end=start+1;while(end<all.length&&all[end].kind!=='heading')end++;return all.slice(start,end).map(b=>({document,b}))})})
 const unique=[...new Map(selected.map(x=>[x.b.id,x])).values()],kept:CourseSource['blocks']=[];let bytes=0
 for(const {document,b} of unique){const candidate={ref:{documentVersionId:document.id,blockId:b.id,page:Math.max(1,b.page),fingerprint:document.fingerprint},text:b.text,quality:b.quality,kind:b.kind},next=Buffer.byteLength(JSON.stringify(candidate));if(bytes+next>64000)break;bytes+=next;kept.push(candidate)}
 if(!kept.some(b=>b.text.trim()))throw new Error('INPUT_REQUIRED')
 return{courseId:course.id,courseName:course.name,chapterId,chapterTitle:chapter.title,chapterMapVersion:version,textbookStatus:outline.status,textbookTitle:outline.textbook,documentVersionIds:[...new Set(kept.map(b=>b.ref.documentVersionId))],blocks:kept,coverage:{totalBlocks:unique.length,includedBlocks:kept.length,truncated:kept.length<unique.length}}
}
