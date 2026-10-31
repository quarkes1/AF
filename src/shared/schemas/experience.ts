import {z} from 'zod'
import {graphemeCount} from '../graphemes'
const id=z.string().min(1).max(160),count=z.number().int().nonnegative(),text=(max:number,min=0)=>z.string().refine(s=>graphemeCount(s)<=max&&graphemeCount(s.trim())>=min)
export const sourceRefSchema=z.object({documentVersionId:id,blockId:id,page:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export const richBlockSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('text'),basis:z.enum(['source','supplement']).optional(),text:text(4000,1),sourceRefs:z.array(sourceRefSchema).max(30)}).strict(),
 z.object({kind:z.literal('math'),basis:z.enum(['source','supplement']).optional(),latex:z.string().min(1).max(4000),display:z.enum(['inline','block']),sourceRefs:z.array(sourceRefSchema).max(30)}).strict(),
])
export const narrativeNodeSchema=z.object({kind:z.enum(['dialogue','narration','choice']),speaker:z.enum(['partner','user','narrator']),blocks:z.array(richBlockSchema).min(1).max(20),poseTag:id.nullable(),backgroundId:id.nullable(),choices:z.array(z.object({id,label:text(200,1)}).strict()).max(8)}).strict()
export const actDraftSchema=z.object({title:text(100,1),nodes:z.array(narrativeNodeSchema).min(1).max(80),ending:z.enum(['actEnd','interaction','continue'])}).strict()
export const answerSchema=z.union([z.object({choiceIds:z.array(id).min(1).max(20)}).strict(),z.object({text:text(8000,1)}).strict(),z.object({number:z.string().regex(/^[+-]?(?:\d{1,16}(?:\.\d{1,16})?|\.\d{1,16})$/),unit:text(40)}).strict()])
export function answerMatchesQuestion(question:{type:string;choices:{id:string}[]},answer:z.infer<typeof answerSchema>):boolean{
 if(['single','multiple','boolean'].includes(question.type))return 'choiceIds'in answer&&new Set(answer.choiceIds).size===answer.choiceIds.length&&answer.choiceIds.every(id=>question.choices.some(c=>c.id===id))&&(question.type==='multiple'||answer.choiceIds.length===1)
 return question.type==='numeric'?'number'in answer:'text'in answer
}
export const questionDraftSchema=z.object({basis:z.enum(['source','supplement']).optional(),type:z.enum(['single','multiple','boolean','text','numeric','short','derivation','explanation']),prompt:z.array(richBlockSchema).min(1).max(15),choices:z.array(z.object({id,label:text(500,1)}).strict()).max(12),answer:answerSchema,rubric:z.array(text(1000,1)).min(1).max(12),hint:text(2000),explanation:z.array(richBlockSchema).max(20),sourceRefs:z.array(sourceRefSchema).max(30),tolerance:z.string().regex(/^\d{1,16}(?:\.\d{1,16})?$/)}).strict().superRefine((q,ctx)=>{
 const choice=['single','multiple','boolean'].includes(q.type)
 if(q.basis!=='supplement'&&!q.sourceRefs.length)ctx.addIssue({code:'custom',message:'A source-based question needs actual source references.'})
 if(!answerMatchesQuestion(q,q.answer)||new Set(q.choices.map(c=>c.id)).size!==q.choices.length||choice&&(q.choices.length<2||q.type==='boolean'&&q.choices.length!==2)||!choice&&q.choices.length!==0)ctx.addIssue({code:'custom',message:'Question type, choices and frozen answer must agree.'})
})
export const lessonDraftSchema=z.object({title:text(200,1),objectives:z.array(text(400,1)).min(1).max(8),textbook:z.array(richBlockSchema).min(1).max(40),blackboard:z.array(richBlockSchema).min(1).max(40),questions:z.array(questionDraftSchema).max(8),sourceRefs:z.array(sourceRefSchema).min(1).max(40),coverage:text(2000,1),warnings:z.array(text(1000)).max(12)}).strict()
const anchor=z.object({actId:id,nodeId:id,pageId:id,scriptRevision:count,paginationVersion:count,revealedGraphemeCount:count}).strict()
export const experienceCommandSchemas={
 'story.prepare':z.object({actId:id.nullable(),mode:z.enum(['normal','afterInterrupt'])}).strict(),
 'story.interrupt':z.object({actId:id,scriptRevision:count,anchor:anchor.nullable(),text:text(8000,1)}).strict(),
 'story.advance':z.object({actId:id,scriptRevision:count,pageId:id,action:z.enum(['revealAll','next']),revealedGraphemeCount:count}).strict(),
 'story.choose':z.object({actId:id,scriptRevision:count,pageId:id,choiceId:id}).strict(),
 'story.resume':z.object({actId:id,scriptRevision:count}).strict(),
 'story.buffer.status':z.object({actId:id,scriptRevision:count}).strict(),
 'story.page.get':z.object({actId:id,scriptRevision:count,pageId:id}).strict(),
 'save.checkpoint':z.object({saveId:id,branchId:id,label:text(64)}).strict(),
 'save.checkpoints':z.object({saveId:id,branchId:id,limit:z.number().int().min(1).max(100).optional(),cursor:id.nullable().optional()}).strict(),
 'save.replay':z.object({checkpointId:id,cursor:z.object({pageIndex:count}).strict().nullable()}).strict(),
 'learning.enter':z.object({courseId:id,chapterId:id,chapterMapVersion:count}).strict(),
 'learning.get':z.object({learningSessionId:id}).strict(),
 'learning.resume':z.object({learningSessionId:id,viewState:z.object({panel:z.enum(['textbook','blackboard','practice']),cursor:count,draft:text(64000),discussionDraft:text(8000),discussionAnchor:id.nullable(),discussionOpen:z.boolean(),panelOpen:z.boolean()}).strict().optional()}).strict(),
 'learning.discuss':z.object({learningSessionId:id,nodeId:id,text:text(8000,1)}).strict(),
 'learning.submit':z.object({learningSessionId:id,questionId:id,questionVersion:count,answer:answerSchema,aidEventIds:z.array(id).max(100)}).strict(),
 'learning.hint':z.object({learningSessionId:id,questionId:id,level:z.enum(['hint','answer'])}).strict(),
 'learning.review':z.object({attemptId:id,reason:text(2000,1)}).strict(),
 'learning.return':z.object({learningSessionId:id}).strict(),
} as const
export const experienceReads=new Set(['story.buffer.status','story.page.get','save.checkpoints','save.replay','learning.get'])
