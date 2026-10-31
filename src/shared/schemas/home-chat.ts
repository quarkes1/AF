import {z} from 'zod'
import {graphemeCount} from '../graphemes'
const id=z.string().min(1).max(160),count=z.number().int().min(0)
const text=(max:number,min=0)=>z.string().refine(s=>graphemeCount(s)<=max&&graphemeCount(s.trim())>=min)
export const homeAnchorSchema=z.object({actId:id,nodeId:id,pageId:id,scriptRevision:count,paginationVersion:count,revealedGraphemeCount:count}).strict()
export const presentationSchema=homeAnchorSchema.extend({receiptId:id,channel:z.literal('home')}).strict()
export const homeCommandSchemas={
 'home.get':z.object({}).strict(),'home.stop':z.object({anchor:homeAnchorSchema.nullable()}).strict(),
 'story.send':z.object({channel:z.literal('home'),text:text(8000,1),anchor:homeAnchorSchema.nullable()}).strict(),
 'story.history':z.object({channel:z.enum(['home','story']).optional(),beforeEventSeq:count.nullable(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().regex(/^\d{1,15}$/).nullable().optional()}).strict(),
 'story.present':z.object({receipt:presentationSchema}).strict(),
 'jobs.get':z.object({jobId:id}).strict(),'jobs.cancel':z.object({jobId:id}).strict(),'jobs.retry':z.object({jobId:id}).strict(),
} as const
export const homeReads=new Set(['home.get','story.history','jobs.get'])
export const dialogueResultSchema=z.object({segments:z.array(z.object({kind:z.enum(['dialogue','narration']).default('dialogue'),text:text(500,1),poseTag:z.string().max(80).optional()}).strict()).min(1).max(12)}).strict().refine(r=>r.segments.reduce((n,s)=>n+graphemeCount(s.text),0)<=2400,'回复超出长度预算。')
