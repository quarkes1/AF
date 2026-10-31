import {z} from 'zod'
const id=z.string().min(1).max(160),name=z.string().trim().min(1).max(160),empty=z.object({}).strict()
const envelope=z.object({protocolVersion:z.literal(1),requestId:z.string().uuid(),command:id,target:z.object({kind:z.enum(['resource','course','provider','job','profile']),id:id.nullable()}).strict(),saveId:z.null(),branchId:z.null(),expectedStateVersion:z.number().int().nonnegative().nullable(),idempotencyKey:z.string().uuid().nullable(),payload:z.unknown()}).strict()
const schema={
 'resource.settings.get':z.object({}).strict(),
 'resource.settings.update':z.object({classificationBatchSize:z.number().int().min(1).max(100)}).strict(),
 'resource.list':z.object({limit:z.number().int().min(1).max(100).optional(),cursor:z.string().nullable().optional(),courseId:id.nullable().optional(),status:z.string().nullable().optional()}).strict(),
 'course.list':z.object({limit:z.number().int().min(1).max(100).optional(),cursor:z.string().nullable().optional()}).strict(),'provider.list':empty,'jobs.list':empty,'jobs.get':z.object({jobId:id}).strict(),'resource.sources':empty,
 'resource.watch':z.object({sourceId:id,enabled:z.boolean()}).strict(),
 'resource.unlinkSource':z.object({sourceId:id}).strict(),
 'resource.importGranted':z.object({resourceIds:z.array(id).min(1).max(500)}).strict(),
 'resource.upload':z.object({filename:name,kind:z.enum(['document','background','music']),bytes:z.instanceof(Uint8Array),metadata:z.object({mime:z.string().max(160).optional(),width:z.number().positive().optional(),height:z.number().positive().optional(),duration:z.number().positive().optional()}).strict()}).strict(),
 'resource.read':z.object({id,offset:z.number().int().min(0),length:z.number().int().min(1).max(4*1024*1024)}).strict(),
 'resource.update':z.object({id,patch:z.object({name:name.optional(),textbook:z.string().max(160).optional(),chapter:z.string().max(160).optional(),position:z.number().min(0).max(100).optional()}).strict()}).strict(),
 'resource.remove':z.object({documentVersionId:id,mode:z.enum(['unlink','deleteManagedCopy'])}).strict(),
 'resource.parse':z.object({documentVersionIds:z.array(id).min(1).max(500),password:z.string().max(1024).optional(),encoding:z.enum(['utf-8','utf-16le','gb18030']).optional(),force:z.boolean().optional()}).strict(),
 'resource.retry':z.object({documentVersionId:id,retryStage:z.enum(['convert','extract','ocr','index'])}).strict(),
 'resource.pick':z.object({mode:z.enum(['folder','files'])}).strict(),
 'resource.scan':z.object({resourceIds:z.array(id).max(100),recursive:z.boolean()}).strict(),
 'resource.blocks':z.object({documentVersionId:id}).strict(),
 'resource.image':z.object({documentVersionId:id,imageId:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 'resource.open':z.object({sourceRef:z.object({documentVersionId:id,blockId:id}).strict()}).strict(),
 'source.retrieve':z.object({query:z.string().trim().min(1).max(500),courseId:id.nullable()}).strict(),
 'course.classify':z.object({documentVersionIds:z.array(id).min(1).max(500),resetManual:z.boolean().optional()}).strict(),
 'course.reviewName':z.object({name:z.string().trim().min(1).max(80)}).strict(),
 'course.assignName':z.object({documentVersionId:id,name:z.string().trim().min(1).max(80),decision:z.enum(['existing','new','direct']),existingId:id.nullable()}).strict(),
 'course.assign':z.object({courseId:id,documentVersionIds:z.array(id).max(500),operation:z.enum(['link','unlink'])}).strict(),
 'provider.configure':z.object({providerId:id.nullable(),protocol:z.literal('openai'),baseUrl:z.string().url().max(500),modelId:name,keyAction:z.enum(['keep','replace','clear']),apiKey:z.string().trim().min(8).max(4096).optional()}).strict().superRefine((p,ctx)=>{if(p.keyAction==='replace'&&!p.apiKey||p.keyAction!=='replace'&&p.apiKey!==undefined)ctx.addIssue({code:'custom',message:'仅替换凭据时提供 API Key。'})}),
 'provider.test':z.object({providerId:id.nullable()}).strict(),
 'jobs.cancel':z.object({jobId:id}).strict(),
 'textbook.suggest':z.object({courseId:id,documentVersionIds:z.array(id).max(500)}).strict(),
 'textbook.answer':z.object({courseId:id,questionId:id,answer:z.string().min(1).max(2000)}).strict(),
 'textbook.skip':z.object({courseId:id}).strict(),
 'textbook.confirm':z.object({courseId:id,candidateId:id.nullable(),chapterMapVersion:z.number().int().min(1),useExistingProgress:z.boolean()}).strict(),
} as const
const reads=new Set(['resource.settings.get','resource.list','course.list','provider.list','jobs.list','jobs.get','resource.read','resource.pick','resource.blocks','resource.image','resource.open','source.retrieve','resource.sources'])

export {envelope as materialRequestSchema,schema as materialCommandSchemas,reads as materialReadCommands}
