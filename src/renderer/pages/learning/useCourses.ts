import {useEffect,useState} from 'react'
import type {BackendClient} from '../materials/backend-client'
import type {CourseRecord,MaterialRecord} from '../../../shared/contracts/materials'
import {courseOutline} from '../../../shared/learning-outline'
import type {CourseView} from './model'
import type {StoryClient} from '../saves/backend-client'
import type {ChatScope} from '../../../shared/contracts/home-chat'
import type {LearningProgressSummary} from '../../../shared/contracts/story'
export function useCourses(backend:BackendClient|null,open:boolean,client:StoryClient|null=null,scope:ChatScope|null=null){
 const [courses,setCourses]=useState<CourseView[]>([]),[error,setError]=useState('')
 useEffect(()=>{if(!backend||!open)return;let disposed=false,timer:ReturnType<typeof setTimeout>|undefined
  const all=async<T,>(command:string)=>{const items:T[]=[];let cursor:string|null=null;do{const page:{items:T[];nextCursor:string|null}=await backend.call(command,{limit:100,cursor});items.push(...page.items);cursor=page.nextCursor}while(cursor);return items}
  const load=async()=>{try{const [catalog,documents,save]=await Promise.all([all<CourseRecord>('course.list'),all<MaterialRecord>('resource.list'),client&&scope?client.call<{learningProgress?:LearningProgressSummary[]}>('save.get',{saveId:scope.saveId}):Promise.resolve(null)]);if(disposed)return;setCourses(catalog.map(course=>{const outline=courseOutline(course,documents),evidence=(save?.learningProgress??[]).filter(p=>p.courseId===course.id&&p.chapterMapVersion===outline.chapterMapVersion),latest=evidence.filter((p,i)=>evidence.findIndex(v=>v.chapterId===p.chapterId)===i),attempts=latest.reduce((n,p)=>n+p.attempts,0),read=latest.filter(p=>p.read).length;return{id:course.id,name:course.name,textbook:outline.textbook,textbookState:outline.status,resourceCount:outline.documentCount,reading:latest.length?`${read} / ${outline.chapters.length} 章已读`:'尚未开始',practice:attempts?`已提交 ${attempts} 次作答`:'暂无作答',last:latest.length?{chapterId:latest[0].chapterId,sectionId:latest[0].chapterId}:undefined,chapterMapVersion:outline.chapterMapVersion,chapters:outline.chapters.map(chapter=>({id:chapter.chapterId,name:chapter.title,status:'ready',imageId:'background.library-hall-day',sections:[{id:chapter.chapterId,name:chapter.title}],materials:documents.filter(d=>chapter.documentIds.includes(d.id)).map(d=>({id:d.id,name:d.filename,location:'已解析资料'}))}))}}));setError('')}catch(e){if(!disposed)setError(e instanceof Error?e.message:'无法读取课程。')}finally{if(!disposed)timer=setTimeout(()=>void load(),1200)}};void load();return()=>{disposed=true;clearTimeout(timer)}
 },[backend,open,client,scope?.saveId,scope?.branchId]);return{courses,error}
}
