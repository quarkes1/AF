import type {CourseRecord,MaterialRecord} from './contracts/materials'
export interface LearningCatalogCourse{courseId:string;name:string;textbook:string;status:'confirmed'|'inferred'|'generic';chapterMapVersion:number;documentCount:number;chapters:{chapterId:string;title:string;blockIds:string[];documentIds:string[]}[]}
export function courseOutline(course:CourseRecord,documents:MaterialRecord[]):LearningCatalogCourse{
 const map=course.textbook,linked=documents.filter(d=>d.courseIds.includes(course.id)&&d.blocks>0),version=map?.chapterMapVersion??0
 const chapters=map?.chapters.length?map.chapters.map((c,i)=>({chapterId:`${course.id}:${version}:${i}`,title:c.title,blockIds:c.blockIds,documentIds:map.documentIds??linked.map(d=>d.id)})):linked.map((d,i)=>({chapterId:`${course.id}:${version}:${i}`,title:d.chapter||d.name,blockIds:[],documentIds:[d.id]}))
 return{courseId:course.id,name:course.name,textbook:map?.candidates.find(c=>c.id===map.selectedId)?.title??'通用教材框架（版本未确认）',status:map?.status==='confirmed'?'confirmed':map?.status==='inferred'?'inferred':'generic',chapterMapVersion:version,documentCount:linked.length,chapters}
}
