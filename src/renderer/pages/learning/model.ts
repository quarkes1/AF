/** Renderer view data only; real course/learning service contracts remain in the specification. */
export interface SectionView {id:string;name:string;lesson?:LessonView}
export interface LessonView {intro:string;paragraphs:string[];formula?:string;graph?:'derivative';source:string;question?:{prompt:string;choices:string[];correct:number;explanation:string}}
export interface ChapterView {id:string;name:string;status:'ready'|'parsing'|'failed';imageId:string;sections:SectionView[];materials:{id:string;name:string;location:string}[]}
export interface CourseView {id:string;name:string;textbook:string;textbookState:'confirmed'|'inferred'|'generic';resourceCount:number;reading:string;practice:string;chapters:ChapterView[];last?:{chapterId:string;sectionId:string}}
export interface CourseMapState {chapterId:string|null;sectionId:string|null;zoom:number;scrollLeft:number;scrollTop:number;directory:boolean;detailOpen:boolean;anchorChanged:boolean}
export function filterCourses(courses:readonly CourseView[],query:string){
  const needle=query.trim().toLocaleLowerCase()
  return courses.filter(course=>`${course.name} ${course.textbook}`.toLocaleLowerCase().includes(needle))
}
export function selectChapter(course:CourseView,chapterId:string){
  const chapter=course.chapters.find(c=>c.id===chapterId)
  const section=chapter?.sections.find(s=>course.last?.chapterId===chapterId&&s.id===course.last.sectionId)??chapter?.sections[0]
  return {chapterId:chapter?.id??null,sectionId:section?.id??null}
}
export function initialCourseView(course:CourseView):CourseMapState{
  const valid=course.last&&course.chapters.some(c=>c.id===course.last!.chapterId&&c.sections.some(s=>s.id===course.last!.sectionId))
  const chapterId=(valid?course.last?.chapterId:course.chapters.find(c=>c.sections.length)?.id)??course.chapters[0]?.id??''
  return {...selectChapter({...course,last:valid?course.last:undefined},chapterId),zoom:1,scrollLeft:0,scrollTop:0,directory:false,detailOpen:true,anchorChanged:!!course.last&&!valid}
}
export interface LessonSession {panel:'textbook'|'blackboard'|'practice';panelOpen:boolean;draft:string;discussion:boolean;explaining:boolean;solutionOpen:boolean;passage:{sectionId:string;quote:string;source:string}|null;answer:number|null;submitted:boolean;assisted:boolean;line:number}
export const newLessonSession=():LessonSession=>({panel:'blackboard',panelOpen:true,draft:'',discussion:false,explaining:false,solutionOpen:false,passage:null,answer:null,submitted:false,assisted:false,line:0})
