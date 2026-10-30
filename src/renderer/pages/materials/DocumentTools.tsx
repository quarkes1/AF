import {useState} from 'react'
import type {MaterialLibrary} from './library'
import type {LibraryItem} from './model'
import type {ContentBlock,CourseRecord} from '../../../shared/contracts/materials'
export function DocumentTools({item,library}:{item:LibraryItem;library:MaterialLibrary}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[password,setPassword]=useState(''),[answer,setAnswer]=useState(''),[query,setQuery]=useState(''),[results,setResults]=useState<(ContentBlock&{documentId:string})[]>([])
 const backend=library.backend;if(!backend)return null
 const course=library.getSnapshot().courses?.find(c=>item.courseIds?.includes(c.id)),textbook=course?.textbook
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();await library.refresh()}catch(error){setError(error instanceof Error?error.message:'操作失败。')}finally{setBusy(false)}}
 const identify=(mode:'suggest'|'skip'|'answer')=>run(async()=>{if(!course)return;const accepted=await backend.call<{jobId?:string}>(`textbook.${mode}`,mode==='suggest'?{courseId:course.id,documentVersionIds:[item.id]}:mode==='skip'?{courseId:course.id}:{courseId:course.id,questionId:`${textbook?.chapterMapVersion}:${textbook?.round}`,answer},course.id);if(accepted.jobId)await backend.waitJob(accepted.jobId);setAnswer('')})
 return <div className="materials-metadata">
  <p role="status">处理状态：{({queued:'排队中',parsing:'解析中',ready:'已解析',partial:'部分可用',failed:'解析失败',needs_review:'需核对'} as Record<string,string>)[item.state??'']??'待解析'} · {item.blocks??0} 个内容块{item.manualOverride?' · 已手动指定科目':''}</p>
  {item.error&&<p className="materials-error">{item.error}</p>}
  {!!item.classificationEvidence?.length&&<details><summary>查看归类依据</summary>{item.contentProfile&&<><p>{item.contentProfile.categoryBasis==='topic'?'研究主题':'学科内容'} · {item.contentProfile.materialType}</p><p>{item.contentProfile.summary}</p><p>相关主题：{item.contentProfile.topics.join('、')}</p></>}{item.classificationEvidence.filter(t=>!/^[-0-9a-f]{36}$/i.test(t)).map((text,i)=><p key={i}>{text}</p>)}</details>}
  {item.state==='failed'&&<label className="materials-field">文档解锁密码<input aria-label="文档解析密码" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off"/></label>}
  <div className="materials-detail__actions"><button disabled={busy||item.state==='parsing'} onClick={()=>void run(async()=>{await backend.call('resource.parse',{documentVersionIds:[item.id],force:true,...password?{password}: {}});setPassword('')})}>重新解析资料</button><button disabled={busy||!item.blocks} onClick={()=>void run(async()=>{await backend.call('course.classify',{documentVersionIds:[item.id],resetManual:true})})}>重新自动归类</button></div>
  {!!library.getSnapshot().courses?.length&&<details><summary>关联多个科目</summary>{library.getSnapshot().courses?.map(c=><label key={c.id} className="materials-field"><span>{c.name}</span><input type="checkbox" checked={item.courseIds?.includes(c.id)??false} disabled={busy} onChange={e=>void run(()=>backend.call('course.assign',{courseId:c.id,documentVersionIds:[item.id],operation:e.target.checked?'link':'unlink'},c.id))}/></label>)}</details>}
  {course&&<details><summary>教材与章节 · {textbook?.status==='confirmed'?'已确认':textbook?.status==='inferred'?'系统推定':textbook?.status==='generic'?'通用教材框架（版本未确认）':'未设置'}</summary>
   <div className="materials-detail__actions"><button disabled={busy} onClick={()=>void identify('suggest')}>识别教材</button><button disabled={busy} onClick={()=>void identify('skip')}>不知道／跳过设置</button></div>
   {textbook?.question&&<form onSubmit={e=>{e.preventDefault();void identify('answer')}}><p>{textbook.question}（第 {textbook.round+1} / 3 轮）</p><input aria-label="教材确认回答" value={answer} maxLength={2000} onChange={e=>setAnswer(e.target.value)}/><button disabled={busy||!answer.trim()}>回答</button></form>}
   {textbook?.candidates.map(c=><div key={c.id}><p>{c.title} · {c.edition??'版次未知'} · {c.confidence==='explicit'?'有明确来源':'仍需确认'}{c.evidenceInputIds?.length?' · 含用户提供的教材信息':''}</p><button disabled={busy} onClick={()=>void run(()=>backend.call('textbook.confirm',{courseId:course.id,candidateId:c.id,chapterMapVersion:textbook.chapterMapVersion,useExistingProgress:true},course.id))}>确认此教材</button>{!!c.evidenceBlockIds.length&&<button disabled={busy} onClick={()=>void run(()=>library.openSource(item.id,c.evidenceBlockIds[0]))}>查看识别依据</button>}</div>)}
   {!!textbook?.chapters.length&&<ol>{textbook.chapters.map((chapter,i)=><li key={i}>{chapter.title}</li>)}</ol>}
  </details>}
  <form onSubmit={e=>{e.preventDefault();void run(async()=>setResults((await backend.call<{items:(ContentBlock&{documentId:string})[]}>('source.retrieve',{query,courseId:course?.id??null})).items))}}><label className="materials-field">来源检索<input aria-label="来源检索" value={query} maxLength={500} onChange={e=>setQuery(e.target.value)}/></label><button disabled={busy||!query.trim()}>检索已解析资料</button></form>
  {results.map(r=><div key={r.id}><p>{library.getSnapshot().items.find(d=>d.id===r.documentId)?.filename} · 第 {r.page} 页／段：{r.text.slice(0,320)}</p><button onClick={()=>void run(()=>library.openSource(r.documentId,r.id))}>定位来源</button></div>)}
  {error&&<p role="alert" className="materials-error">{error}</p>}
 </div>
}
