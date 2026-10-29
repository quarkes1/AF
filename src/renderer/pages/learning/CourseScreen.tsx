import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {ChapterMap} from './ChapterMap'
import {LearningStage} from './LearningStage'
import {filterCourses,initialCourseView,newLessonSession,type CourseMapState,type CourseView,type LessonSession} from './model'
import type {SettingsPreferences} from '../settings/model'
import './learning.css'

export function CourseScreen({preferences,open,resources,onBack,initialCourses=[],review=false}:{preferences:SettingsPreferences;open:boolean;resources:ResourceCatalog;onBack:()=>void;initialCourses?:readonly CourseView[];review?:boolean}){
  const [view,setView]=useState<'overview'|'map'|'stage'>('overview')
  const [query,setQuery]=useState(''),[courseId,setCourseId]=useState<string|null>(initialCourses[0]?.id??null)
  const [maps,setMaps]=useState<Record<string,CourseMapState>>({})
  const [sessions,setSessions]=useState<Record<string,LessonSession>>({})
  const [notice,setNotice]=useState<string|null>(null),[dialog,setDialog]=useState<'materials'|'textbook'|null>(null)
  const back=useRef<HTMLButtonElement>(null),modal=useRef<HTMLDialogElement>(null),modalOrigin=useRef<HTMLElement|null>(null),overviewScroll=useRef<HTMLDivElement>(null)
  const screen=useRef<HTMLElement>(null),overviewOffset=useRef(0)
  const wasOpen=useRef(false)
  useLayoutEffect(()=>{
    if(open&&!wasOpen.current)setView('overview')
    wasOpen.current=open
  },[open])
  const course=initialCourses.find(c=>c.id===courseId)
  const map=course?(maps[course.id]??initialCourseView(course)):null
  const chapter=course?.chapters.find(c=>c.id===map?.chapterId)
  const section=chapter?.sections.find(s=>s.id===map?.sectionId)
  const sessionKey=course&&chapter&&section?`${course.id}/${chapter.id}/${section.id}`:''
  const session=sessions[sessionKey]??newLessonSession()
  const filtered=filterCourses(initialCourses,query)
  const patchMap=(patch:Partial<CourseMapState>)=>{if(course)setMaps(old=>({...old,[course.id]:{...(old[course.id]??initialCourseView(course)),...patch}}))}
  const patchSession=(patch:Partial<LessonSession>)=>setSessions(old=>({...old,[sessionKey]:{...(old[sessionKey]??newLessonSession()),...patch}}))
  const importMaterials=()=>setNotice('资料导入与解析模块尚未接入；当前不会创建课程或上传文件。')
  const enterMap=(id=courseId)=>{
    if(!id)return
    setCourseId(id);setView('map');setNotice(null)
  }
  const focusBack=()=>requestAnimationFrame(()=>(screen.current?.querySelector<HTMLTextAreaElement>('.learning-discussion textarea')??back.current)?.focus({preventScroll:true}))
  const returnOverview=()=>{setView('overview');setNotice(null);focusBack()}
  const returnMap=()=>{setView('map');setNotice(null);focusBack()}
  useEffect(()=>{
    if(!open){setNotice(null);return}
    const frame=requestAnimationFrame(()=>{
      if(view==='overview'&&overviewScroll.current)overviewScroll.current.scrollTop=overviewOffset.current
      ;(screen.current?.querySelector<HTMLTextAreaElement>('.learning-discussion textarea')??back.current)?.focus({preventScroll:true})
    })
    return()=>cancelAnimationFrame(frame)
  },[open,view])
  useEffect(()=>{
    if(!open)return
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||event.keyCode===229||dialog)return
      event.preventDefault()
      if(notice){setNotice(null);focusBack();return}
      if(view==='stage'){
        if(session.discussion){patchSession({discussion:false});focusBack()}
        else if(session.solutionOpen)patchSession({solutionOpen:false})
        else if(session.panelOpen)patchSession({panelOpen:false})
        else returnMap()
      }else if(view==='map'){
        if(map?.detailOpen){patchMap({detailOpen:false});focusBack()}
        else returnOverview()
      }else onBack()
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[open,view,notice,dialog,session,course,map,onBack])
  useEffect(()=>{
    if(!dialog)return
    modalOrigin.current=document.activeElement as HTMLElement
    modal.current?.showModal()
    return()=>{modal.current?.close();(modalOrigin.current?.isConnected?modalOrigin.current:back.current)?.focus({preventScroll:true})}
  },[dialog])
  const startLearning=()=>{
    if(!course||!chapter||!section||chapter.status!=='ready')return
    if(!review){setNotice('请先创建故事并配置模型。当前学习目标已保留，完成配置后仍需确认开始。');return}
    setView('stage');setNotice(null)
  }
  const statusText=(item:CourseView)=>item.textbookState==='confirmed'?'教材已核对':item.textbookState==='inferred'?'教材待核对':'通用目录 / 未指定教材'
  return <section ref={screen} className="course-screen" data-open={open} data-testid="course-screen" inert={!open} aria-hidden={!open} aria-label="章节学习">
    <img className="course-screen__background" src={resources.url('background.library-hall-day')} alt=""/>
    <div className="course-screen__shade"/>
    {view==='stage'&&course&&chapter&&section?<LearningStage preferences={preferences} active={open} backRef={back} course={course} chapter={chapter} section={section} resources={resources} session={session} onChange={patchSession} onBack={returnMap} onHome={onBack} onNotice={setNotice} onSource={()=>setDialog('materials')}/>:<>
      <img className="course-screen__brand" src={resources.url('brand.logo.inverse')} alt="AF"/>
      <header className="course-screen__header"><div><button ref={back} className="quiet-button" aria-label={view==='map'?'返回学科总览':'返回首页'} onClick={view==='map'?returnOverview:onBack}><Icon name="arrow-left" resources={resources}/></button><h1>章节学习</h1></div><nav className="course-breadcrumb" aria-label="学习位置"><button onClick={returnOverview}>学科总览</button>{view==='map'&&<><span>/</span><span>{course?.name}</span></>}</nav></header>
      {review&&<p className="course-screen__review">演示课程 · 仅预览界面，不记录学习证据</p>}
      {view==='overview'?<div className="course-overview">
        <section className="course-overview__main course-panel" aria-label="学科总览"><header><label className="course-search"><Icon name="search" resources={resources}/><input aria-label="搜索课程或教材" placeholder="搜索课程或教材" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button className="quiet-button" aria-label="清空搜索" onClick={()=>setQuery('')}><Icon name="close" resources={resources}/></button>}</label><button className="quiet-button" onClick={importMaterials}><Icon name="plus" resources={resources}/>添加资料</button></header>
          <div ref={overviewScroll} className="course-overview__list" onScroll={event=>{overviewOffset.current=event.currentTarget.scrollTop}}>
            {!initialCourses.length?<div className="course-empty"><Icon name="book-open" resources={resources}/><h2>添加学习资料</h2><p>从教材、课件或试题开始，按科目整理学习内容。</p><div><button className="save-primary" onClick={importMaterials}>选文件夹</button><button className="save-secondary" onClick={importMaterials}>添加文件</button></div></div>:!filtered.length?<div className="course-empty"><h2>没有匹配的课程</h2><p>试试其他课程名或教材关键词。</p><button className="save-secondary" onClick={()=>setQuery('')}>清空筛选</button></div>:<div className="course-grid">{filtered.map(item=><button key={item.id} className="course-card" aria-pressed={courseId===item.id} aria-label={`选择学科 ${item.name}`} onClick={()=>setCourseId(item.id)} onDoubleClick={()=>enterMap(item.id)}><span className="course-card__icon"><Icon name="book-open" resources={resources}/><small>{item.resourceCount} 份资料</small></span><h2>{item.name}</h2><p>{item.textbook}</p><span className="course-card__textbook">{statusText(item)}</span><dl><div><dt>阅读</dt><dd>{item.reading}</dd></div><div><dt>练习</dt><dd>{item.practice}</dd></div></dl></button>)}</div>}
          </div>
        </section>
        <aside className="course-overview__detail course-panel" aria-label="学科详情">{course?<><span className="course-detail__eyebrow">当前科目</span><h2>{course.name}</h2><p>{course.textbook}</p><span className="course-status">{statusText(course)}</span><dl><div><dt>资料</dt><dd>{course.resourceCount} 份</dd></div><div><dt>最近阅读</dt><dd>{course.reading}</dd></div><div><dt>练习状态</dt><dd>{course.practice}</dd></div></dl><div className="course-detail__actions"><button className="save-primary" onClick={()=>enterMap()}>进入章节 <span aria-hidden="true">→</span></button><button className="save-secondary" onClick={()=>setDialog('textbook')}>教材与版本</button><button className="save-secondary" onClick={importMaterials}>补充资料</button></div></>:<div className="course-empty"><Icon name="folder" resources={resources}/><h2>从一份资料开始</h2><p>课程、教材版本和章节目录会显示在这里。</p></div>}</aside>
      </div>:course&&map?<>
        <nav className="course-switcher" aria-label="切换学科">{initialCourses.map(item=><button key={item.id} aria-pressed={item.id===course.id} onClick={()=>setCourseId(item.id)}>{item.name}</button>)}<button onClick={returnOverview}><Icon name="arrow-left" resources={resources}/>返回学科</button></nav>
        {!course.chapters.length?<section className="chapter-map course-panel"><div className="course-empty"><Icon name="file-empty" resources={resources}/><h2>本学科尚无可用目录</h2><p>资料仍在等待解析或教材匹配，不会用虚构章节替代。</p><button className="save-secondary" onClick={importMaterials}>补充资料</button><button className="learning-inline-action" onClick={()=>setDialog('textbook')}>设置教材版本</button></div></section>:<ChapterMap course={course} state={map} resources={resources} onChange={patchMap}/>}
        {map.detailOpen&&chapter?<aside className="chapter-detail course-panel" aria-label="章节详情" key={`${course.id}/${chapter.id}`}><span className="course-detail__eyebrow">CHAPTER {String(course.chapters.indexOf(chapter)+1).padStart(2,'0')}</span><h2><span>{chapter.name.split(' ')[0]}</span>{chapter.name.split(' ').slice(1).join(' ')}</h2><p>{course.textbook}</p><span className="course-status">{statusText(course)}</span>
          {chapter.status!=='ready'?<div className="course-processing" role="status"><h3>{chapter.status==='parsing'?'目录解析中':'目录解析失败'}</h3><p>{chapter.status==='parsing'?'已有章节仍可访问，返回和切换科目不受影响。':'可以查看来源或重试解析，当前不会生成虚构目录。'}</p><button className="save-secondary" onClick={()=>setNotice('解析服务尚未接入；当前不会提交虚构解析任务。')}>{chapter.status==='parsing'?'查看处理状态':'重试解析'}</button></div>:<ol className="chapter-sections" aria-label="选择小节">{chapter.sections.map(item=><li key={item.id}><button aria-pressed={map.sectionId===item.id} onClick={()=>patchMap({sectionId:item.id})}><span aria-hidden="true">{map.sectionId===item.id?'▸':''}</span>{item.name}<Icon name="chevron-right" resources={resources}/></button></li>)}</ol>}
          <div className="course-detail__actions"><button className="chapter-materials quiet-button" onClick={()=>setDialog('materials')}>关联资料 · 教材 / 课堂课件<Icon name="chevron-right" resources={resources}/></button><button className="save-primary" disabled={chapter.status!=='ready'||!section} onClick={startLearning}>{course.last?.chapterId===chapter.id&&course.last?.sectionId===section?.id?'继续学习':'开始学习'}<span aria-hidden="true">→</span></button><button className="save-secondary" onClick={()=>patchMap({detailOpen:false})}>收起详情</button></div>
        </aside>:<button className="chapter-reopen save-secondary" onClick={()=>patchMap({detailOpen:true})} disabled={!chapter}>展开章节详情</button>}
      </>:null}
    </>}
    {notice&&<div className="course-notice" role="status"><p>{notice}</p><button className="quiet-button" aria-label="关闭学习提示" onClick={()=>{setNotice(null);focusBack()}}><Icon name="close" resources={resources}/></button></div>}
    <dialog ref={modal} className="course-dialog" aria-labelledby="course-dialog-title" onCancel={event=>{event.preventDefault();setDialog(null)}}><header><h2 id="course-dialog-title">{dialog==='textbook'?'教材与版本':'关联资料'}</h2><button className="quiet-button" onClick={()=>setDialog(null)} aria-label="关闭资料面板"><Icon name="close" resources={resources}/></button></header>{dialog==='textbook'?<><p>{course?.textbook}</p><p>教材状态：{course&&statusText(course)}</p><p>完整教材、课件或试题均可作为入口。后续通过简短问答确认版本，也可跳过并采用推定或通用框架。</p><button className="save-secondary" onClick={()=>{setDialog(null);setNotice('教材版本问答与资料导入尚未接入，所选科目和位置已保留。')}}>设置教材版本</button></>:<><p>{chapter?.name??'当前课程'}</p>{chapter?.materials.length?<ul>{chapter.materials.map(material=><li key={material.id}><strong>{material.name}</strong><span>{material.location}</span><button className="learning-inline-action" onClick={()=>{setDialog(null);setNotice('资料阅读器尚未接入；演示条目不对应真实文件，当前不会打开或下载文件。')}}>定位来源</button></li>)}</ul>:<p>暂无可定位资料。此处仅展示已关联的来源，不提供虚构文件。</p>}<small>演示资料并非用户教材。数学示例为自编内容，不冒用教材页码。</small></>}</dialog>
  </section>
}
