import {z} from 'zod'
const graphemes=(value:string)=>[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(value)].length
const text=(max:number,min=0)=>z.string().refine(s=>graphemes(s)<=max&&graphemes(s.trim())>=min)
const id=z.string().min(1).max(160),name=text(64,1),description=text(8000)
const tag=z.object({id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/).refine(s=>!Object.hasOwn(Object.prototype,s)),label:text(32,1)}).strict()
export const characterContentSchema=z.object({name,sourceKind:z.enum(['original','existing']),sourceWork:description,personality:description,partnerIdentity:description,userIdentity:description,address:description,background:description,knowledge:description,speech:description,relationship:description,initiative:description,immutable:description,events:description,poses:z.array(tag).min(1).max(128),defaultPose:id,sprites:z.record(z.string(),z.string().max(7*1024*1024)),examples:z.boolean()}).strict().superRefine((c,ctx)=>{
 const ids=new Set(c.poses.map(p=>p.id)),labels=new Set(c.poses.map(p=>p.label.trim()))
 if(ids.size!==c.poses.length||labels.size!==c.poses.length||!ids.has(c.defaultPose)||Object.keys(c.sprites).some(k=>!ids.has(k)))ctx.addIssue({code:'custom',message:'立绘标签重复或关联无效。'})
})
const page=z.object({limit:z.number().int().min(1).max(100).optional(),cursor:z.string().max(160).nullable().optional()}).strict()
export const storyCommandSchemas={
 'profile.get':z.object({}).strict(),
 'profile.update':z.object({patch:z.object({displayName:text(32,1).optional(),preferredAddress:text(64).optional(),timezone:z.string().max(100).refine(s=>{try{new Intl.DateTimeFormat('zh',{timeZone:s});return true}catch{return false}}).optional(),textScale:z.number().min(1).max(1.5).optional(),reducedMotion:z.boolean().optional()}).strict()}).strict(),
 'template.list':page,'template.get':z.object({id}).strict(),
 'template.create':z.object({content:characterContentSchema,draft:z.boolean()}).strict(),
 'template.update':z.object({id,templateVersion:z.number().int().min(1),content:characterContentSchema,draft:z.boolean()}).strict(),
 'template.delete':z.object({id,confirmedName:name}).strict(),'template.select':z.object({id}).strict(),
 'selection.get':z.object({}).strict(),
 'save.list':page,'save.get':z.object({saveId:id}).strict(),
 'save.create':z.object({name,characterTemplateId:id,characterTemplateVersion:z.number().int().min(1),worldSetting:z.object({mode:z.enum(['realWorld','custom']),description:text(8000,1)}).strict(),partnerIdentity:text(2000,1),userIdentity:text(2000,1),relationshipStart:text(2000,1),courseIds:z.array(id).max(500)}).strict(),
 'save.activate':z.object({saveId:id,branchId:id}).strict(),'save.rename':z.object({saveId:id,name}).strict(),'save.delete':z.object({saveId:id,confirmedName:name}).strict(),
} as const
export const storyReads=new Set(['template.list','template.get','selection.get','save.list','save.get','profile.get'])
export const storyRequestSchema=z.object({protocolVersion:z.literal(1),requestId:id,command:z.string().max(80),target:z.object({kind:z.enum(['template','save','selection','profile','job']),id:id.nullable()}).strict(),saveId:id.nullable(),branchId:id.nullable(),expectedStateVersion:z.number().int().min(0).nullable(),idempotencyKey:id.nullable(),payload:z.unknown()}).strict()
