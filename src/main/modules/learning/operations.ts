import {teachingPresentation} from '../../../shared/teaching-presentation'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {ExperienceService} from '../story/experience-service'
import type {ChatScope} from '../../../shared/contracts/home-chat'
import type {Attempt,ExperienceJob,FrozenQuestion,LearningSession,LearningSnapshot,LessonArtifact,RichBlock,ScriptPage,SourceRef,CourseSource} from '../../../shared/contracts/experience'
import {lessonDraftSchema,richBlockSchema,sourceRefSchema,answerMatchesQuestion} from '../../../shared/schemas/experience'
import {gradeObjective,validateRichBlocks,validateMath,paginateNodes} from '../story/experience-validation'
import {contentHash} from '../../infrastructure/digest'
import {graphemeCount} from '../../../shared/graphemes'

const feedbackSchema=z.object({correct:z.boolean().nullable(),score:z.number().min(0).max(1).nullable(),feedback:z.string().min(1).max(6000),uncertain:z.array(z.string().max(2000)).max(10),sourceRefs:z.array(sourceRefSchema).max(30)}).strict()
export class LearningOperations{
 constructor(private host:ExperienceService){}
 get(scope:ChatScope,id:string){const session=this.host.data.get('learning',id);this.host.assertOwned(session,scope);return session}
 write(session:LearningSession){session.stateVersion++;return this.host.data.put('learning',session.learningSessionId,session,session)}
 progress(scope:ChatScope){const views=this.host.data.list('discussion',scope),attempts=this.host.data.list('attempt',scope);return this.host.data.list('learning',scope).map(session=>{const reading=views.filter(v=>v.learningSessionId===session.learningSessionId&&v.kind==='reading'),originals=attempts.filter(a=>a.learningSessionId===session.learningSessionId&&!a.reviewOfAttemptId),effective=originals.map(original=>attempts.find(a=>a.reviewOfAttemptId===original.attemptId&&['graded','needsReview'].includes(a.status))??original);return{courseId:session.courseId,chapterId:session.chapterId,chapterMapVersion:session.chapterMapVersion,learningSessionId:session.learningSessionId,read:reading.length>0&&reading.every(v=>v.page.revealedGraphemeCount===v.page.graphemeCount),attempts:originals.length,independentCorrect:effective.filter(a=>!a.assisted&&a.correct===true&&a.status==='graded').length,state:session.state}})}
 private checkSources(refs:SourceRef[],source:CourseSource){for(const ref of refs)if(!source.blocks.some(b=>contentHash(b.ref)===contentHash(ref)))throw new Error('INVALID_SOURCE')}
 snapshot(scope:ChatScope,id:string):LearningSnapshot{
  const session=this.get(scope,id),lesson=session.lessonId?this.host.data.get('lesson',session.lessonId):null,job=this.host.data.get('job',session.jobId),{input:_,providerFingerprint:__,sessionId:___,...publicJob}=job,{source,...publicSession}=session
  const views=this.host.data.list('discussion',scope).filter(v=>v.learningSessionId===id)
  return{session:publicSession,source,lesson:lesson?{compositionVersion:lesson.compositionVersion,title:lesson.title,objectives:lesson.objectives,textbook:lesson.textbook,blackboard:lesson.blackboard,sourceRefs:lesson.sourceRefs,coverage:lesson.coverage,warnings:lesson.warnings}:null,questions:lesson?.questions.filter(q=>q.validation==='verified').map(({answer:_,rubric:__,hint:___,explanation:____,...question})=>question)??[],readingPages:views.filter(v=>v.kind==='reading').map(v=>v.page).sort((a,b)=>a.index-b.index),discussionPages:views.filter(v=>v.kind==='discussion').map(v=>v.page).sort((a,b)=>a.index-b.index),attempts:this.host.data.list('attempt',scope).filter(a=>a.learningSessionId===id),aids:this.host.data.list('aid',scope).filter(a=>a.learningSessionId===id),job:publicJob,jobs:this.host.data.list('job',scope).filter(j=>j.input.learningSessionId===id).map(({input:_,providerFingerprint:__,sessionId:___,...value})=>value)}
 }
 private question(session:LearningSession,id:string){if(!session.lessonId)throw new Error('INPUT_REQUIRED');const q=this.host.data.get('lesson',session.lessonId).questions.find(q=>q.questionId===id&&q.validation==='verified');if(!q)throw new Error('FORBIDDEN');return q}
 private aid(session:LearningSession,question:FrozenQuestion,level:'hint'|'answer'){
  const answer='choiceIds'in question.answer?question.answer.choiceIds.map(id=>question.choices.find(c=>c.id===id)!.label).join('、'):'number'in question.answer?`${question.answer.number} ${question.answer.unit}`.trim():question.answer.text
  const aidEventId=randomUUID(),content:RichBlock[]=level==='hint'?[{kind:'text',text:question.hint||'可先阅读题目所关联的资料。',sourceRefs:question.sourceRefs}]:[{kind:'text',text:`参考答案：${answer}`,sourceRefs:question.sourceRefs},...question.explanation]
  this.host.data.put('aid',aidEventId,session,{aidEventId,learningSessionId:session.learningSessionId,questionId:question.questionId,level,content});this.host.emit(session,'learning.aid',{aidEventId,questionId:question.questionId,level});return{content,aidEventId}
 }
 command(command:string,p:any,scope:ChatScope):unknown{
  if(command==='learning.enter'){
   const source=this.host.options.sources.learningSource(p.courseId,p.chapterId,p.chapterMapVersion),existing=this.host.data.list('learning',scope).find(s=>s.courseId===p.courseId&&s.chapterId===p.chapterId&&s.chapterMapVersion===p.chapterMapVersion&&s.lessonId&&this.host.data.get('lesson',s.lessonId).compositionVersion===2&&contentHash(s.source)===contentHash(source))
   const previousId=this.host.story.save(scope.saveId).learningSessionId;if(previousId&&this.host.data.has('learning',previousId)){const previous=this.get(scope,previousId);previous.paused=true;this.write(previous)}
   this.host.invalidate(scope);const anchor=this.host.acts.pause(scope)
   if(existing){existing.paused=false;existing.mainReturnAnchor=anchor;this.write(existing);this.host.touch(scope,{learningSessionId:existing.learningSessionId});return this.host.accepted(this.host.data.get('job',existing.jobId))}
   if(!this.host.options.provider.summary().configured)throw new Error('MODEL_NOT_CONFIGURED')
   const id=randomUUID(),job=this.host.createJob(scope,'learningCompose','lesson',{learningSessionId:id},null),session:LearningSession={...scope,learningSessionId:id,courseId:p.courseId,chapterId:p.chapterId,chapterMapVersion:p.chapterMapVersion,source,mainReturnAnchor:anchor,state:'reading',nodeId:randomUUID(),cursor:0,panel:'blackboard',draft:'',discussionDraft:'',discussionAnchor:null,discussionOpen:false,panelOpen:true,paused:false,lessonId:null,jobId:job.jobId,createdAt:new Date().toISOString(),stateVersion:0,discussion:[]}
   this.host.data.put('learning',id,scope,session);this.host.touch(scope,{learningSessionId:id});return this.host.accepted(job)
  }
  if(command==='learning.review'){
   const original=this.host.data.get('attempt',p.attemptId),session=this.get(scope,original.learningSessionId),question=this.question(session,original.questionId);if(original.status==='grading')throw new Error('INPUT_REQUIRED')
   const attemptId=randomUUID(),inputEventId=this.host.emit(scope,'learning.review.accepted',{attemptId,originalAttemptId:original.attemptId}).eventId,job=this.host.createJob(scope,'research','review',{learningSessionId:session.learningSessionId,attemptId,originalAttemptId:original.attemptId,reason:p.reason,inputEventId},null),attempt:Attempt={...original,attemptId,reviewOfAttemptId:original.attemptId,status:'grading',jobId:job.jobId,createdAt:new Date().toISOString(),correct:null,score:null,feedback:'正在复核，原评分记录保留。',uncertain:[]};this.host.data.put('attempt',attemptId,scope,attempt);session.jobId=job.jobId;this.write(session);void question;return this.host.accepted(job)
  }
  const session=this.get(scope,p.learningSessionId)
  if(command==='learning.get')return this.snapshot(scope,session.learningSessionId)
  if(command==='learning.resume'){
   if(p.viewState){const view=p.viewState;if(view.discussionAnchor!==null&&view.discussionAnchor!==session.nodeId&&!this.host.data.get('lesson',session.lessonId!).questions.some(q=>q.questionId===view.discussionAnchor))throw new Error('FORBIDDEN');Object.assign(session,view);this.write(session);return this.snapshot(scope,session.learningSessionId)}
   this.host.invalidate(scope);this.host.acts.pause(scope);session.paused=false;this.write(session);this.host.touch(scope,{learningSessionId:session.learningSessionId});return this.snapshot(scope,session.learningSessionId)
  }
  if(command==='learning.return'){session.paused=true;this.write(session);this.host.touch(scope,{learningSessionId:null});this.host.emit(scope,'learning.returned',{learningSessionId:session.learningSessionId,state:session.state});return{mainReturnAnchor:session.mainReturnAnchor,...scope}}
  if(session.paused||this.host.story.save(scope.saveId).learningSessionId!==session.learningSessionId)throw new Error('FORBIDDEN')
  if(command==='learning.hint')return this.aid(session,this.question(session,p.questionId),p.level)
  if(command==='learning.submit'){
   const question=this.question(session,p.questionId);if(question.questionVersion!==p.questionVersion)throw new Error('CONTEXT_STALE')
   if(!answerMatchesQuestion(question,p.answer))throw new Error('INVALID_PAYLOAD')
   const existing=this.host.data.list('attempt',scope).find(a=>a.learningSessionId===session.learningSessionId&&a.questionId===question.questionId&&a.reviewOfAttemptId===null)
   if(existing){if(contentHash(existing.answer)!==contentHash(p.answer))throw new Error('INVALID_PAYLOAD');return this.host.accepted(this.host.data.get('job',existing.jobId!))}
   for(const id of p.aidEventIds){const aid=this.host.data.get('aid',id);if(aid.learningSessionId!==session.learningSessionId||aid.questionId!==question.questionId)throw new Error('FORBIDDEN')}
   const aids=this.host.data.list('aid',scope).filter(a=>a.learningSessionId===session.learningSessionId&&a.questionId===question.questionId),attemptId=randomUUID(),inputEventId=this.host.emit(scope,'learning.answer.accepted',{attemptId,questionId:question.questionId}).eventId,job=this.host.createJob(scope,'research','grade',{learningSessionId:session.learningSessionId,attemptId,inputEventId},null),attempt:Attempt={attemptId,learningSessionId:session.learningSessionId,questionId:question.questionId,questionVersion:question.questionVersion,answer:p.answer,assisted:aids.length>0,aidEventIds:aids.map(a=>a.aidEventId),correct:null,score:null,feedback:'作答已保存，正在核对。',uncertain:[],sourceRefs:question.sourceRefs,createdAt:new Date().toISOString(),reviewOfAttemptId:null,status:'grading',jobId:job.jobId}
   this.host.data.put('attempt',attemptId,scope,attempt);session.jobId=job.jobId;this.write(session);return this.host.accepted(job)
  }
  if(command==='learning.discuss'){
   if(p.nodeId!==session.nodeId&&!this.host.data.get('lesson',session.lessonId!).questions.some(q=>q.questionId===p.nodeId))throw new Error('FORBIDDEN')
   this.host.invalidate(scope);const turn=this.host.home.repository.createTurn(scope,p.text,'learning');session.discussionAnchor=p.nodeId;session.discussion.push({id:turn.input.id,role:'user',text:p.text,sourceRefs:[]})
   if(p.nodeId!==session.nodeId)this.aid(session,this.question(session,p.nodeId),'hint')
   const job=this.host.createJob(scope,'research','discussion',{learningSessionId:session.learningSessionId,nodeId:p.nodeId,text:p.text},turn.turnId);session.jobId=job.jobId;this.write(session);return this.host.accepted(job)
  }throw new Error('INVALID_PAYLOAD')
 }
 retryReference(old:ExperienceJob,next:ExperienceJob){if(old.operation==='act')return;const session=this.get(old,old.input.learningSessionId as string);session.jobId=next.jobId;this.write(session);if(['grade','review'].includes(old.operation)){const attempt=this.host.data.get('attempt',old.input.attemptId as string);attempt.jobId=next.jobId;attempt.status='grading';this.host.data.put('attempt',attempt.attemptId,old,attempt)}}
 fail(job:ExperienceJob,cancelled:boolean){if(!['grade','review'].includes(job.operation)||!this.host.data.has('attempt',job.input.attemptId as string))return;const attempt=this.host.data.get('attempt',job.input.attemptId as string);attempt.status='failed';attempt.feedback=cancelled?'核对已停止，已提交的作答保留，可重试。':'核对未完成，已提交的作答保留，可重试。';this.host.data.put('attempt',attempt.attemptId,job,attempt)}
 private page(session:LearningSession,blocks:RichBlock[],index:number):ScriptPage{const body={actId:session.learningSessionId,scriptRevision:1,paginationVersion:1,pageId:randomUUID(),nodeId:randomUUID(),index,kind:'narration' as const,speaker:'narrator' as const,blocks,poseTag:null,backgroundId:null,choices:[],graphemeCount:blocks.reduce((n,b)=>n+graphemeCount(b.kind==='text'?b.text:b.latex),0),ending:null};return{...body,contentHash:contentHash(body),revealedGraphemeCount:0}}
 private recordVisibleDisclosure(session:LearningSession,page:ScriptPage){
  if(!session.lessonId)return
  const position=session.discussion.findIndex(m=>m.id===page.pageId);let start=position,end=position+1
  while(start>0&&session.discussion[start-1].role==='assistant')start--
  while(end<session.discussion.length&&session.discussion[end].role==='assistant')end++
  const ids=new Set(session.discussion.slice(start,end).filter(m=>m.role==='assistant').map(m=>m.id)),pages=this.host.data.list('discussion',session).filter(view=>view.learningSessionId===session.learningSessionId&&ids.has(view.page.pageId)&&view.page.revealedGraphemeCount>0).sort((a,b)=>a.page.index-b.page.index)
  const normalize=(text:string)=>text.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase(),visible=normalize(pages.flatMap(view=>this.host.acts.visibleBlocks(view.page)).map(b=>b.kind==='text'?b.text:b.latex).join('\n')),aids=this.host.data.list('aid',session),attempts=this.host.data.list('attempt',session)
  for(const question of this.host.data.get('lesson',session.lessonId).questions){
   if(question.validation!=='verified'||aids.some(a=>a.learningSessionId===session.learningSessionId&&a.questionId===question.questionId)||attempts.some(a=>a.learningSessionId===session.learningSessionId&&a.questionId===question.questionId))continue
   const answer=question.answer
   let disclosed=false
   if('choiceIds'in answer&&question.type!=='boolean'){const correct=question.choices.filter(c=>answer.choiceIds.includes(c.id)),other=question.choices.filter(c=>!answer.choiceIds.includes(c.id));disclosed=correct.every(c=>normalize(c.label).length>=2&&visible.includes(normalize(c.label)))&&other.length>0&&other.every(c=>!visible.includes(normalize(c.label)))}
   else if('text'in answer)disclosed=normalize(answer.text).length>=6&&visible.includes(normalize(answer.text))
   else if('number'in answer&&answer.unit.trim())disclosed=visible.includes(normalize(`${answer.number}${answer.unit}`))
   if(disclosed){const aidEventId=randomUUID(),content:RichBlock[]=[{kind:'text',text:'讨论中已呈现相关参考要点，本题后续作答将标记为使用辅助。',sourceRefs:question.sourceRefs}];this.host.data.put('aid',aidEventId,session,{aidEventId,learningSessionId:session.learningSessionId,questionId:question.questionId,level:'hint',content});this.host.emit(session,'learning.answer.disclosed',{aidEventId,questionId:question.questionId,pageId:page.pageId})}
  }
 }
 present(scope:ChatScope,p:any){
  const session=this.get(scope,p.actId),view=this.host.data.get('discussion',p.pageId);if(view.learningSessionId!==session.learningSessionId||this.host.story.save(scope.saveId).learningSessionId!==session.learningSessionId)throw new Error('FORBIDDEN');const page=view.page
  if(page.nodeId!==p.nodeId||p.scriptRevision!==1||p.paginationVersion!==1||p.revealedGraphemeCount>page.graphemeCount||session.paused)throw new Error('CONTEXT_STALE')
  const hash=contentHash(p);if(this.host.data.has('receipt',p.receiptId)){const prior=this.host.data.get('receipt',p.receiptId);if(prior.hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');return prior.result}
  if(p.revealedGraphemeCount>page.revealedGraphemeCount){page.revealedGraphemeCount=p.revealedGraphemeCount;this.host.data.put('discussion',p.pageId,scope,view);if(view.kind==='discussion'){const blocks=this.host.acts.visibleBlocks(page),text=blocks.map(b=>b.kind==='text'?b.text:`\\[${b.latex}\\]`).join('\n');this.host.home.repository.shared(scope,page.pageId,'资料解答',text);this.recordVisibleDisclosure(session,page)}else{const pages=this.host.data.list('discussion',scope).filter(v=>v.learningSessionId===session.learningSessionId&&v.kind==='reading');if(pages.length&&pages.every(v=>v.page.revealedGraphemeCount===v.page.graphemeCount)&&session.state==='reading')session.state='completedReading'}this.write(session)}
  const result={acceptedReceiptId:p.receiptId,cursor:{pageId:page.pageId,revealedGraphemeCount:page.revealedGraphemeCount},stateVersion:this.host.story.save(scope.saveId).stateVersion};this.host.data.put('receipt',p.receiptId,scope,{hash,result});return result
 }
 async execute(job:ExperienceJob,signal:AbortSignal){
  let session=this.get(job,job.input.learningSessionId as string)
  if(job.operation==='lesson'){
   const raw=await this.host.invoke(job,'composeLesson',{chapterTitle:session.source.chapterTitle,requirements:'根据课程、章节标题、目录与现有资料编写详细教学材料。只有标题或部分课件时，也应运用可靠的通用学科知识完成概念、条件、推导、例题、易错点与总结，不能把材料不足当作停止教学的理由。上传资料摘录标记 basis=source 并附准确引用；补充讲解标记 basis=supplement，不伪称课件原文，可不附来源。黑板正文只放教学内容，来源覆盖、提取质量、核验状态等仅放 coverage/warnings，不写入 text。保留原章节标题，公式用结构化 LaTeX；练习答案仍须可靠核验。'},signal,session.source),draft=lessonDraftSchema.parse(raw),ids=new Set(session.source.blocks.map(b=>b.ref.blockId))
   this.checkSources(draft.sourceRefs,session.source);validateRichBlocks([...draft.textbook,...draft.blackboard],ids)
   for(const block of [...draft.textbook,...draft.blackboard]){this.checkSources(block.sourceRefs,session.source);if(!block.sourceRefs.length&&block.basis!=='supplement')throw new Error('INVALID_SOURCE')}
   draft.blackboard=teachingPresentation(draft.blackboard);if(!draft.blackboard.length)throw new Error('INVALID_MODEL_OUTPUT')
   const questions:FrozenQuestion[]=draft.questions.map(q=>{this.checkSources(q.sourceRefs,session.source);validateRichBlocks([...q.prompt,...q.explanation],ids);for(const block of [...q.prompt,...q.explanation])this.checkSources(block.sourceRefs,session.source);return{...q,questionId:randomUUID(),questionVersion:1,validation:'unknown',validationReason:'等待独立来源核对。'}})
   if(questions.length){
    const review=z.object({verdicts:z.array(z.object({index:z.number().int().nonnegative(),status:z.enum(['verified','unknown','rejected']),reason:z.string().min(1).max(2000),sourceRefs:z.array(sourceRefSchema).max(30)}).strict()).max(8)}).strict().parse(await this.host.invoke(job,'verifyQuestions',{questions,requirements:'独立核对冻结题目、答案和评分要点。basis=source 必须使用实际来源证据，不能把目录当答案依据；basis=supplement 可用可靠的通用学科知识与独立推导核对，不得编造引用。区分确实核对通过与模型自信，歧义、错误或不能确定时返回unknown/rejected；返回每题 verdicts。'},signal,session.source))
    for(const verdict of review.verdicts){const q=questions[verdict.index];if(!q)throw new Error('INVALID_QUESTION');this.checkSources(verdict.sourceRefs,session.source);if(q.basis!=='supplement'&&!verdict.sourceRefs.length)throw new Error('INVALID_SOURCE');const math=[...q.prompt,...q.explanation].filter(b=>b.kind==='math'),uncertainMath=math.some(b=>b.kind==='math'&&validateMath(b.latex).mathematicalStatus!=='verified'),badOcr=q.sourceRefs.some(r=>session.source.blocks.find(b=>b.ref.blockId===r.blockId)?.quality==='review');q.validation=verdict.status==='verified'&&!uncertainMath&&!badOcr?'verified':'unknown';q.validationReason=uncertainMath?'数学含义尚未独立核验，不能用于可靠判分。':badOcr?'原文提取需要核对。':verdict.reason}
   }
   this.host.guard(job,signal)
   await this.host.validateLayout(job,[...draft.textbook,...draft.blackboard,...questions.filter(q=>q.validation==='verified').flatMap(q=>q.prompt)],'learning',signal)
   this.host.story.transaction(()=>{session=this.get(job,session.learningSessionId);const lessonId=randomUUID(),artifact:LessonArtifact={...draft,compositionVersion:2,questions,warnings:[...draft.warnings,...questions.filter(q=>q.validation!=='verified').map(q=>`有题目暂不可发布：${q.validationReason}`)]};this.host.data.put('lesson',lessonId,job,artifact);session.lessonId=lessonId;session.jobId=job.jobId;this.write(session);paginateNodes([{kind:'narration',speaker:'narrator',blocks:artifact.textbook,choices:[],poseTag:null,backgroundId:null}]).forEach((node,index)=>{const page=this.page(session,node.blocks,index);this.host.data.put('discussion',page.pageId,job,{learningSessionId:session.learningSessionId,kind:'reading',page})})});return session.learningSessionId
  }
  if(job.operation==='discussion'){
   const visibleViews=this.host.data.list('discussion',job).filter(v=>v.learningSessionId===session.learningSessionId&&v.kind==='discussion'&&v.page.revealedGraphemeCount>0),currentId=job.turnId?this.host.home.repository.turn(job.turnId).input.id:null,thread=session.discussion.flatMap<{role:"user"|"assistant";text:string}>(m=>{if(m.id===currentId)return[];if(m.role==='user')return[{role:m.role,text:m.text}];const view=visibleViews.find(v=>v.page.pageId===m.id);return view?[{role:'assistant' as const,text:this.host.acts.visibleBlocks(view.page).map(b=>b.kind==='text'?b.text:b.latex).join('\n')}]:[]}).slice(-16)
   const result=z.object({blocks:z.array(richBlockSchema).min(1).max(20),sourceRefs:z.array(sourceRefSchema).max(30)}).strict().parse(await this.host.invoke(job,'discussion',{question:job.input.text,thread,requirements:'由独立解答服务自然讲清知识，不冒充搭档。可以用可靠的通用知识补充讲解，补充块标记basis=supplement且不伪造引用；实际摘录附准确引用。不读取隐藏参考答案或替用户作答。正文不写解析日志或工作过程说明。'},signal,session.source))
   this.checkSources(result.sourceRefs,session.source);validateRichBlocks(result.blocks,new Set(session.source.blocks.map(b=>b.ref.blockId)));for(const block of result.blocks){this.checkSources(block.sourceRefs,session.source);if(!block.sourceRefs.length&&block.basis!=='supplement')throw new Error('INVALID_SOURCE')}await this.host.validateLayout(job,result.blocks,'learning',signal);this.host.guard(job,signal)
   this.host.story.transaction(()=>{session=this.get(job,session.learningSessionId);const offset=this.host.data.list('discussion',job).filter(v=>v.learningSessionId===session.learningSessionId&&v.kind==='discussion').length;paginateNodes([{kind:'narration',speaker:'narrator',blocks:result.blocks,choices:[],poseTag:null,backgroundId:null}]).forEach((node,index)=>{const page=this.page(session,node.blocks,offset+index);this.host.data.put('discussion',page.pageId,job,{learningSessionId:session.learningSessionId,kind:'discussion',page});session.discussion.push({id:page.pageId,role:'assistant',text:'',sourceRefs:result.sourceRefs})});this.write(session)});return session.learningSessionId
  }
  const attempt=this.host.data.get('attempt',job.input.attemptId as string),question=this.question(session,attempt.questionId),objective=job.operation==='grade'?gradeObjective(question,attempt.answer):null
  const result=objective?{...objective,uncertain:[],sourceRefs:question.sourceRefs}:feedbackSchema.parse(await this.host.invoke(job,job.operation==='review'?'review':'grade',{question,answer:attempt.answer,original:job.operation==='review'?this.host.data.get('attempt',job.input.originalAttemptId as string):null,reason:job.input.reason??null,requirements:'严格按已冻结的题目、答案和rubric判分，不更改参考标准。source题须引用已读来源；supplement题依据可靠学科知识与可复核推理，不伪造引用。不确定时correct=null并列出原因，不从模型自信推断掌握。'},signal,session.source))
  this.checkSources(result.sourceRefs,session.source);if(question.basis!=='supplement'&&!result.sourceRefs.length)throw new Error('INVALID_SOURCE');this.host.guard(job,signal)
  this.host.story.transaction(()=>{const next:Attempt={...attempt,...result,status:result.correct===null?'needsReview':'graded'};this.host.data.put('attempt',attempt.attemptId,job,next);session=this.get(job,session.learningSessionId);const all=this.host.data.list('attempt',job).filter(a=>a.learningSessionId===session.learningSessionId),evidence=all.filter(a=>a.reviewOfAttemptId===null).map(original=>all.find(a=>a.reviewOfAttemptId===original.attemptId&&['graded','needsReview'].includes(a.status))??original).filter(a=>a.status==='graded'),independent=evidence.filter(a=>!a.assisted&&a.correct===true),hasExplanation=independent.some(a=>['short','derivation','explanation'].includes(this.question(session,a.questionId).type));session.state=result.correct===false?'needsReview':independent.length>=2&&hasExplanation?'provisionallyMastered':'practiced';this.write(session);this.host.emit(job,'learning.attempt',{attemptId:attempt.attemptId,assisted:attempt.assisted,correct:result.correct})});return attempt.attemptId
 }
}
