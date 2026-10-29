import {useEffect,useRef,useState,type RefObject} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import type {SettingsPreferences} from '../settings/model'
import {Icon} from '../../components/Icon'
import {Formula} from '../../math/Formula'
import type {ChapterView,CourseView,LessonSession,SectionView} from './model'

function DerivativeGraph(){
  const curve=Array.from({length:61},(_,i)=>{const x=i/30;return `${i?'L':'M'}${36+x*100},${236-x*x*50}`}).join(' ')
  return <figure className="derivative-graph" aria-label="函数平方曲线与指定位置的切线示例">
    <svg viewBox="0 0 340 275" role="img"><title>抛物线与切线</title><defs><marker id="learning-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#263445"/></marker></defs><path d="M36 245V16M20 236H300" stroke="#263445" strokeWidth="1.6" fill="none" markerEnd="url(#learning-arrow)"/><path d={curve} stroke="#3b69c8" strokeWidth="2.5" fill="none"/><path d="M86 236L216 106" stroke="#39bdeb" strokeWidth="2.5"/><path d="M36 186H136V236" stroke="#778595" strokeDasharray="5 4" fill="none"/><circle cx="136" cy="186" r="4" fill="#24374d"/></svg>
    <span className="graph-label graph-label--curve"><Formula inline latex="y=x^2"/></span><span className="graph-label graph-label--x"><Formula inline latex="x"/></span><span className="graph-label graph-label--y"><Formula inline latex="y"/></span><span className="graph-label graph-label--point"><Formula inline latex="(1,1)"/></span><span className="graph-label graph-label--one"><Formula inline latex="1"/></span>
    <figcaption>蓝色为函数曲线，青色为切线。</figcaption>
  </figure>
}

export function LearningStage({preferences,active,backRef,course,chapter,section,session,resources,onChange,onBack,onHome,onNotice,onSource}:{
  preferences:SettingsPreferences;active:boolean;backRef:RefObject<HTMLButtonElement|null>;course:CourseView;chapter:ChapterView;section:SectionView;session:LessonSession;resources:ResourceCatalog;onChange:(patch:Partial<LessonSession>)=>void;onBack:()=>void;onHome:()=>void;onNotice:(text:string)=>void;onSource:()=>void
}){
  const discussionInput=useRef<HTMLTextAreaElement>(null)
  useEffect(()=>{if(active&&session.discussion)discussionInput.current?.focus({preventScroll:true})},[active,session.discussion,session.explaining])
  const lesson=section.lesson
  const discussPassage=()=>{
    const selection=window.getSelection()
    const article=document.querySelector('.learning-textbook')
    const quote=selection?.anchorNode&&article?.contains(selection.anchorNode)?selection.toString().trim():''
    onChange({discussion:true,explaining:false,passage:{sectionId:section.id,quote:quote||lesson?.intro||section.name,source:lesson?.source||'当前小节'}})
  }
  const lines=['这一步我还没想明白，我们一起看看吧。','你想先看看资料，还是试着向我解释一下？']
  const line=lines[Math.min(session.line,lines.length-1)]
  const chars=Array.from(line)
  const [shown,setShown]=useState(0)
  useEffect(()=>setShown(0),[line])
  useEffect(()=>{if(!preferences.typewriter){setShown(chars.length);return}if(!active)return;const timer=setInterval(()=>setShown(count=>{if(count>=chars.length){clearInterval(timer);return count}return count+1}),1000/preferences.subtitleSpeed);return()=>clearInterval(timer)},[line,active,preferences.typewriter,preferences.subtitleSpeed])
  const advance=()=>{if(shown<chars.length)setShown(chars.length);else if(session.line<lines.length-1)onChange({line:session.line+1})}
  useEffect(()=>{
    if(!active)return
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.isComposing||event.repeat||event.keyCode===229)return
      if((event.target as HTMLElement).closest('input,textarea,select,button,[contenteditable="true"]'))return
      if(event.code==='Space'){event.preventDefault();advance()}
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[active,shown,line,session.line])
  return <section className="learning-stage" aria-label="章节学习演出">
    <div className="learning-stage__heading"><button ref={backRef} className="quiet-button" onClick={onBack} aria-label="返回章节地图"><Icon name="arrow-left" resources={resources}/></button><span>{course.name} / {chapter.name}</span><small>演示内容</small></div>
    <img className={`learning-stage__partner${session.panelOpen?' learning-stage__partner--aside':''}`} src={resources.url(session.panelOpen?'character.af-guide.06-explaining':'character.af-guide.03-thinking')} alt="Aurore" draggable="false"/>
    <section className="learning-workspace" data-open={session.panelOpen} inert={!session.panelOpen} aria-hidden={!session.panelOpen} aria-label="学习资料面板">
      <header><div role="tablist" aria-label="学习面板" onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||(event.target as HTMLElement).getAttribute('role')!=='tab')return
        event.preventDefault();const panels=['textbook','blackboard','practice'] as const
        const index=event.key==='Home'?0:event.key==='End'?2:(panels.indexOf(session.panel)+(event.key==='ArrowRight'?1:2))%3
        onChange({panel:panels[index]});event.currentTarget.querySelector<HTMLButtonElement>(`[data-panel="${panels[index]}"]`)?.focus()
      }}>{(['textbook','blackboard','practice'] as const).map((panel,i)=><button key={panel} role="tab" id={`lesson-tab-${panel}`} data-panel={panel} aria-controls="lesson-panel" tabIndex={session.panel===panel?0:-1} aria-selected={session.panel===panel} onClick={()=>onChange({panel})}>{['教材','黑板','练习'][i]}</button>)}</div><button className="quiet-button" onClick={()=>onChange({panelOpen:false})} aria-label="收起学习面板"><Icon name="close" resources={resources}/></button></header>
      <div className="learning-workspace__body" id="lesson-panel" role="tabpanel" aria-labelledby={`lesson-tab-${session.panel}`}>
        <h1>{section.name}</h1>
        {!lesson?<div className="learning-no-content"><Icon name="book-open" resources={resources}/><h2>尚无本节学习内容</h2><p>目录可正常浏览。生成教学内容需要模型配置与学习服务，未缓存不代表本节被锁定。</p><button className="save-secondary" onClick={()=>onNotice('模型配置与学习服务尚未接入；当前科目、章节与小节选择已保留。')}>配置模型</button></div>:session.panel==='textbook'?<article className="learning-textbook"><p className="learning-source-label">{lesson.source}</p><h2>{lesson.intro}</h2>{lesson.paragraphs.map(p=><p key={p}>{p}</p>)}{lesson.formula&&<Formula latex={lesson.formula}/>}<p>此页用于演示阅读与来源交互，不代表已解析用户教材。</p><button className="learning-source" onClick={onSource}><Icon name="book-open" resources={resources}/>查看来源说明</button><button className="learning-inline-action" onClick={discussPassage}>就这段讨论</button></article>:session.panel==='blackboard'?<article><div className="learning-blackboard"><div><p className="learning-intro">{lesson.intro}</p>{lesson.paragraphs.map(p=><p key={p}>{p}</p>)}{lesson.formula&&<Formula latex={lesson.formula}/>}</div>{lesson.graph==='derivative'&&<DerivativeGraph/>}</div><button className="learning-source" onClick={onSource}><Icon name="book-open" resources={resources}/>{lesson.source}</button></article>:<article className="learning-practice">
          {lesson.question?<><p>{lesson.question.prompt}</p><Formula latex="f(x)=x^2,\quad a=1"/><fieldset><legend>单选 · 界面示例，不记录成绩</legend>{lesson.question.choices.map((choice,index)=><label key={choice}><input type="radio" name="practice-choice" checked={session.answer===index} onChange={()=>onChange({answer:index,submitted:false})}/><span>{String.fromCharCode(65+index)}</span><Formula inline latex={choice}/></label>)}</fieldset><button className="learning-inline-action" onClick={()=>onChange({solutionOpen:true,assisted:true})}>查看示例解析</button><button className="save-primary" disabled={session.answer===null||session.submitted} onClick={()=>onChange({submitted:true})}>提交示例答案</button>{session.submitted&&<div className="learning-feedback" role="status"><strong>{session.answer===lesson.question.correct?'示例答案正确':'再想一想'}</strong><p>{lesson.question.explanation}</p>{session.assisted&&<p>已参考示例解析，本次不视为独立作答。</p>}</div>}</>:<p>尚无可用练习，可先阅读资料或展开讨论。</p>}
        </article>}
        {session.solutionOpen&&<aside className="learning-explanation" aria-label="示例解答"><h2>示例解答</h2><p>以下为独立解答面板，不代表搭档原有知识。</p><Formula latex="f'(x)=2x,\qquad f'(1)=2"/><p>仅对应当前演示例题，不构成真实教材内容的核验结论。</p><button className="learning-inline-action" onClick={()=>onChange({solutionOpen:false})}>收起解析</button></aside>}
      </div>
    </section>
    {!session.panelOpen&&<button className="learning-expand save-secondary" onClick={()=>onChange({panelOpen:true})}><Icon name="book-open" resources={resources}/>展开学习面板</button>}
    {session.discussion&&<form className="learning-discussion" aria-label="章节讨论" onSubmit={event=>{event.preventDefault();if(session.draft.trim())onNotice('讨论服务尚未接入，输入内容已保留；不会生成虚构回复。')}}><header><strong>{section.name} · {session.explaining?'我来解释':'讨论'}</strong><button className="quiet-button" type="button" aria-label="关闭讨论" onClick={()=>onChange({discussion:false})}><Icon name="close" resources={resources}/></button></header>{session.passage&&<blockquote><strong>讨论片段 · {section.name}</strong><p>{session.passage.quote}</p><cite>{session.passage.source}</cite></blockquote>}<label htmlFor="learning-discussion-draft">说说你的想法</label><textarea ref={discussionInput} id="learning-discussion-draft" value={session.draft} onChange={event=>onChange({draft:event.target.value})} rows={3}/><button className="save-primary" disabled={!session.draft.trim()} type="submit">发送</button></form>}
    <footer className="learning-stage__dialogue"><div><span>Aurore</span><button className="learning-stage__line" onClick={advance} aria-label="补全或推进搭档对白">{chars.slice(0,shown).join('')}<span className="learning-stage__cursor" aria-hidden="true">▸</span></button></div><nav aria-label="学习演出操作"><button className="save-secondary" onClick={()=>onChange({discussion:true,explaining:false,passage:null})}><Icon name="chat" resources={resources}/>讨论</button><button className="save-secondary" onClick={()=>onChange({discussion:true,explaining:true,passage:null})}><Icon name="lightbulb" resources={resources}/>我来解释</button><button className="save-secondary" onClick={onHome}><Icon name="arrow-left" resources={resources}/>返回首页</button></nav></footer>
  </section>
}
