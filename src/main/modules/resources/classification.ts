import {z} from 'zod'
import type {CourseRecord,MaterialContentProfile,MaterialRecord} from '../../../shared/contracts/materials'
import {MaterialRepository,normalizeCourse} from './repository'

const proposalSchema=z.object({documentId:z.string(),name:z.string().trim().min(1).max(80),categoryBasis:z.enum(['course','topic']),materialType:z.string().min(1).max(80),summary:z.string().min(1).max(1200),topics:z.array(z.string().min(1).max(80)).max(12),evidenceBlockIds:z.array(z.string()).max(20),certainty:z.enum(['supported','uncertain']),reason:z.string().max(1000)}).strict()
const discoverySchema=z.object({assignments:z.array(proposalSchema).max(500)}).strict()
const reconciliationSchema=z.object({groups:z.array(z.object({documentIds:z.array(z.string()).min(1).max(500),courseId:z.string().nullable(),name:z.string().trim().min(1).max(80),reason:z.string().max(1000)}).strict()).max(500)}).strict()
type Proposal=z.infer<typeof proposalSchema>
export type CategoryContext=CourseRecord&{examples:{documentId:string;summary:string;topics:string[];materialType:string;categoryBasis:'course'|'topic'}[]}
export type ClassificationModel=(stage:'resourceClassify'|'resourceReconcile',input:unknown,documentIds:string[],catalog:CategoryContext[])=>Promise<unknown>

function context(repo:MaterialRepository):CategoryContext[]{
 const documents=repo.list().filter(d=>d.kind==='document')
 return repo.courses().map(course=>({...course,textbook:null,examples:documents.filter(d=>d.courseIds.includes(course.id)).slice(0,3).map(d=>({documentId:d.id,summary:(d.contentProfile?.summary??repo.blocks(d.id).filter(b=>b.quality!=='review').slice(0,3).map(b=>b.text).join('\n')).slice(0,500),topics:d.contentProfile?.topics??[],materialType:d.contentProfile?.materialType??'未识别',categoryBasis:d.contentProfile?.categoryBasis??'course'}))}))
}
function profile(p:Proposal):MaterialContentProfile{return{suggestedCategory:p.name,categoryBasis:p.categoryBasis,materialType:p.materialType,summary:p.summary,topics:p.topics,evidenceBlockIds:p.evidenceBlockIds,reason:p.reason}}

/** Discovery is catalog-blind; reconciliation only receives validated evidence and current library scope. */
export async function classifyContent(repo:MaterialRepository,ids:string[],signal:AbortSignal,model:ClassificationModel){
 const originals=ids.map(id=>repo.get(id)).filter(d=>!d.manualOverride&&d.blocks>0)
 if(!originals.length)return{classified:0,needsReview:0}
 const originalById=new Map(originals.map(d=>[d.id,d]))
 const discovered=discoverySchema.parse(await model('resourceClassify',{
  instruction:'Independently categorize each authorized document by its actual content. No pre-existing category list applies. Return JSON {assignments:[{documentId,name,categoryBasis:"course"|"topic",materialType,summary,topics:string[],evidenceBlockIds:string[],certainty:"supported"|"uncertain",reason}]}. Use a concise reusable broad subject name. For course materials infer the subject from substantive concepts even if no course label appears. For research/review papers use their research topic when an exact course is unknown. categoryBasis is course for textbooks/slides/exercises, topic for research/review papers; it does not assert an exact enrolled course. Document type and chapter title are separate from category. A single document can support a new category. Cite source block IDs. Never invent a course from author/institution. Reasons and user-facing descriptions must be Chinese. Unreadable or genuinely ambiguous evidence => uncertain, not merely absence of a course label.',
  documents:originals.map(d=>({id:d.id,filename:d.filename}))
 },originals.map(d=>d.id),[]))
 signal.throwIfAborted()
 const seen=new Set<string>(),supported:Proposal[]=[],review=new Map<string,string>()
 for(const p of discovered.assignments){
  if(!originalById.has(p.documentId)||seen.has(p.documentId))throw new Error('初分结果包含未授权或重复文件。')
  seen.add(p.documentId)
  const blocks=repo.blocks(p.documentId),valid=p.evidenceBlockIds.length>0&&p.evidenceBlockIds.every(id=>blocks.some(b=>b.id===id&&b.text.trim()&&b.quality!=='review'))
  if(p.certainty==='supported'&&valid)supported.push(p)
  else review.set(p.documentId,p.reason||'资料内容不足，需核对归属。')
 }
 for(const d of originals)if(!seen.has(d.id))review.set(d.id,'模型未给出有依据的内容分类。')
 const catalog=context(repo),catalogIdentity=JSON.stringify(repo.courses()),separations=JSON.stringify(repo.separations())
 const byId=new Map(supported.map(p=>[p.documentId,p]))
 const reconcileInput={
  instruction:'Reconcile content-derived proposals against the library categories and each other. Read course_catalog: it is paginated and searchable by query (category names or substantive topics), courseIds, offset and limit. Search multiple relevant names/topics rather than assuming the first page is complete. Return JSON {groups:[{documentIds:string[],courseId:existing UUID|null,name:canonical category name,reason}]}. Cover every proposal exactly once. Reuse a category only for equivalent learning/content scope, considering summaries/topics/examples, not just similar names. Otherwise create a concise new course- or topic-based category with courseId=null, including for a single file. A new name must not collide with any existing name or alias: use the existing UUID when equivalent, or choose a distinct descriptive name when not equivalent. No fixed course list or requirement for an explicit syllabus label. Different chapters/material types do not require different categories. Mere overlap is insufficient to merge distinct courses. Explicit user separation is binding, including moving separated origins into a third category. Keep existing names and IDs. Do not rename or delete established categories. Reasons must be Chinese.',
  proposals:supported,separatedCoursePairs:repo.separations()
 }
 let reconciled:z.infer<typeof reconciliationSchema>={groups:[]}
 let validationFeedback:string|undefined
 for(let attempt=0;supported.length&&attempt<2;attempt++){
  const raw=await model('resourceReconcile',{...reconcileInput,...validationFeedback?{validationFeedback}:{}},supported.map(p=>p.documentId),catalog)
  signal.throwIfAborted()
  try{
   reconciled=reconciliationSchema.parse(raw)
   const grouped=new Set<string>(),newNames=new Set<string>(),originsByTarget=new Map<string,string[]>()
   for(const group of reconciled.groups){
    if(group.courseId&&!catalog.some(c=>c.id===group.courseId))throw new Error('归并结果引用未知类别。')
    if(!group.courseId){const normalized=normalizeCourse(group.name);if(newNames.has(normalized))throw new Error('归并结果包含重复的新类别。');if(repo.findCourse(group.name))throw new Error('新类别名称与已有名称或别名冲突，等价时须引用已有 UUID，不等价时须用不同名称。');newNames.add(normalized)}
    const key=group.courseId??normalizeCourse(group.name),origins=originsByTarget.get(key)??[]
    for(const id of group.documentIds){
     if(!byId.has(id)||grouped.has(id))throw new Error('归并结果包含未授权或重复文件。')
     grouped.add(id);origins.push(...originalById.get(id)!.courseIds)
    }
    if(origins.some(a=>origins.some(b=>repo.areSeparate(a,b))))throw new Error('不能将用户明确分离的类别归并到同一目标类别。')
    originsByTarget.set(key,origins)
   }
   if(grouped.size!==supported.length)throw new Error('归并结果遗漏资料，请重试。')
   break
  }catch(error){
   if(attempt===1)throw error
   validationFeedback=error instanceof z.ZodError?'Output schema invalid: use exactly the requested groups object.':error instanceof Error?error.message:'Invalid reconciliation.'
  }
 }
 const current=(d:MaterialRecord)=>{try{const now=repo.get(d.id);return !now.manualOverride&&now.stateVersion===d.stateVersion}catch{return false}}
 const eligible=new Set(originals.filter(current).map(d=>d.id))
 if(!eligible.size)return{classified:0,needsReview:0}
 if(JSON.stringify(repo.courses())!==catalogIdentity||JSON.stringify(repo.separations())!==separations)throw new Error('STALE_STATE')
 let classified=0,needsReview=0
 repo.transaction(()=>{
  signal.throwIfAborted()
  for(const [id,reason] of review)if(eligible.has(id)){repo.update(id,{state:'needs_review',classificationEvidence:[reason],error:null});needsReview++}
  const prepared:{group:z.infer<typeof reconciliationSchema>['groups'][number];course:CourseRecord;ids:string[]}[]=[]
  for(const group of reconciled.groups){
   const active=group.documentIds.filter(id=>eligible.has(id));if(!active.length)continue
   let course=group.courseId?repo.course(group.courseId):undefined
   const compatible=active.filter(id=>{if(course&&repo.get(id).courseIds.some(old=>repo.areSeparate(old,course!.id))){repo.update(id,{state:'needs_review',classificationEvidence:['与用户明确保留的独立类别冲突，未自动调整。']});needsReview++;return false}return true})
   if(!compatible.length)continue
   course??=repo.createCourse(group.name)
   prepared.push({group,course,ids:compatible})
  }
  // Reserve every canonical identity before aliases can capture another group's name.
  for(const {group,course,ids:compatible} of prepared){
   // A replacement category inherits the original separation boundaries across future batches.
   for(const id of compatible)for(const origin of originalById.get(id)!.courseIds){
    if(origin===course.id)continue
    for(const [a,b] of repo.separations())if(a===origin||b===origin){const other=a===origin?b:a;if(other!==course.id)repo.separateCourses(course.id,other)}
   }
   for(const id of compatible){
    const p=byId.get(id)!
    const aliasOwner=repo.findCourse(p.name);if(!aliasOwner||aliasOwner.id===course.id)repo.addAlias(course.id,p.name)
    repo.assign(id,[course.id],'automatic')
    const blocks=repo.blocks(id),hasReview=blocks.some(b=>b.quality==='review')
    repo.update(id,{state:hasReview?'needs_review':repo.get(id).error?'partial':'ready',contentProfile:profile(p),classificationEvidence:[p.reason,group.reason,...p.evidenceBlockIds]})
    classified++
   }
  }
 })
 return{classified,needsReview}
}
