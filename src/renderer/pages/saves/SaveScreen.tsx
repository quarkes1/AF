import { useEffect,useRef,useState,type Dispatch,type SetStateAction } from 'react'
import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'
import { canResume,displayTime,paginate,renameError,sortStories,storyModifiedAt,type CheckpointView,type StoryView } from './model'
import './saves.css'
import {CreateStoryDialog,type NewStoryValues} from './CreateStoryDialog'
import type {CompanionView} from '../companions/model'

function Thumbnail({resources,id}:{resources:ResourceCatalog;id?:string}){
  const [missing,setMissing]=useState(false)
  useEffect(()=>setMissing(false),[id])
  return <div className="save-thumbnail">{id&&resources.has(id)&&!missing?<img src={resources.url(id)} alt="存档演出截图" onError={()=>setMissing(true)}/>:<><Icon name="file-empty" resources={resources}/><span>暂无演出截图</span></>}</div>
}

export function SaveScreen({open,resources,onBack,stories,onStoriesChange,resumeRequest,review=false,createRequest=0,selectedCompanion=null,onEnterStory,backLabel='返回首页',onCreate,onRename,onDelete,companions=[],selectedCompanionId='af-guide',activeStoryId=null}:{
  open:boolean;resources:ResourceCatalog;onBack:()=>void;stories:StoryView[];onStoriesChange:Dispatch<SetStateAction<StoryView[]>>;resumeRequest?:{id:string;sequence:number};review?:boolean;createRequest?:number;selectedCompanion?:string|null;onEnterStory:(story:StoryView)=>boolean|Promise<boolean>;backLabel?:string;onCreate?:(values:NewStoryValues)=>Promise<StoryView>;onRename?:(story:StoryView,name:string)=>Promise<StoryView>;onDelete?:(story:StoryView)=>Promise<void>;companions?:CompanionView[];selectedCompanionId?:string;activeStoryId?:string|null
}){
  const setStories=onStoriesChange
  const handledResume=useRef(0)
  const [storyId,setStoryId]=useState<string|null>(sortStories(stories)[0]?.id??null)
  const [view,setView]=useState<'stories'|'checkpoints'>('stories')
  const [filter,setFilter]=useState<CheckpointView['kind']>('manual')
  const [page,setPage]=useState(0)
  const [checkpointId,setCheckpointId]=useState<string|null>(null)
  const [notice,setNotice]=useState<string|null>(null)
  const [dialog,setDialog]=useState<'rename'|'delete'|null>(null)
  const [name,setName]=useState(''),[error,setError]=useState<string|null>(null)
  const [creating,setCreating]=useState(false),[mutating,setMutating]=useState(false)
  const mutation=useRef(false),activation=useRef(0)
  const back=useRef<HTMLButtonElement>(null),modal=useRef<HTMLDialogElement>(null),field=useRef<HTMLInputElement>(null)
  const previousFocus=useRef<HTMLElement|null>(null)
  const storyPage=useRef(0),handledCreate=useRef(0)
  const orderedStories=sortStories(stories)
  useEffect(()=>{if(!open||storyId&&stories.some(s=>s.id===storyId)||!stories.length)return;const ordered=sortStories(stories),chosen=ordered.find(s=>s.id===activeStoryId)??ordered[0];setStoryId(chosen.id);setPage(Math.floor(ordered.findIndex(s=>s.id===chosen.id)/6))},[open,stories,activeStoryId,storyId])
  const story=stories.find(s=>s.id===storyId)
  const checkpoints=story?.checkpoints.filter(c=>c.kind===filter)??[]
  const listing=paginate<StoryView|CheckpointView>(view==='stories'?orderedStories:checkpoints,page,view==='stories')
  const checkpoint=checkpoints.find(c=>c.id===checkpointId)
  const create=()=>{if(onCreate){setCreating(true);setNotice(null)}else setNotice(selectedCompanion?`已选择搭档 ${selectedCompanion}。故事创建服务尚未接入，当前未创建故事或修改已有存档。`:'搭档、身份与关系设置将在下一步接入；当前未创建故事，聊天草稿仍保留。')}
  const leaveLayer=()=>{
    if(view==='checkpoints'){setView('stories');setPage(storyPage.current);setCheckpointId(null);setNotice(null)}
    else onBack()
  }
  useEffect(()=>{
    if(!open){setNotice(null);return}
    const frame=requestAnimationFrame(()=>back.current?.focus({preventScroll:true}))
    return()=>cancelAnimationFrame(frame)
  },[open])
  useEffect(()=>{if(open&&createRequest!==handledCreate.current){handledCreate.current=createRequest;create()}},[open,createRequest])
  useEffect(()=>{
    if(!open)return
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||event.keyCode===229||dialog||creating)return
      event.preventDefault()
      if(notice)setNotice(null)
      else leaveLayer()
    }
    window.addEventListener('keydown',key)
    return()=>window.removeEventListener('keydown',key)
  },[open,dialog,creating,notice,view,onBack])
  useEffect(()=>{
    if(!dialog)return
    previousFocus.current=document.activeElement as HTMLElement
    modal.current?.showModal()
    field.current?.focus()
    return()=>{modal.current?.close();(previousFocus.current?.isConnected?previousFocus.current:back.current)?.focus({preventScroll:true})}
  },[dialog])
  const toCheckpoints=()=>{
    if(view==='checkpoints')return
    if(!story){setNotice('请先选择一个故事，再查看它的保存点。');return}
    storyPage.current=listing.page;setView('checkpoints');setPage(0);setCheckpointId(null);setFilter('manual');setNotice(null)
  }
  const changePage=(next:number)=>{
    const result=paginate<StoryView|CheckpointView>(view==='stories'?orderedStories:checkpoints,next,view==='stories')
    setPage(result.page);setNotice(null)
    if(view==='stories')setStoryId((result.items[0] as StoryView|undefined)?.id??null)
    else setCheckpointId(null)
  }
  const restoreStory=async(target:StoryView)=>{
    const sequence=++activation.current
    if(!canResume(target)){setNotice(target.status==='corrupt'?'存档损坏，需通过备份恢复。':'存档迁移中，完成后才可继续。');return}
    try{const entered=await onEnterStory(target);if(sequence!==activation.current)return;if(!entered){setNotice('存档对应的搭档或默认立绘不可用，当前搭档未改变。');return}
    setNotice(onCreate?`已激活故事“${target.name}”，首页使用此档的搭档快照。主线演出尚未接入。`:`已将首页搭档切换为 ${target.companionSnapshot?.name??target.partner}。演出模块尚未接入，当前未读取真实剧情或改写存档。`)}catch(reason){if(sequence===activation.current)setNotice(reason instanceof Error?reason.message:'激活失败，原故事未改变。')}
  }
  const resume=()=>{if(story&&!checkpoint?.corrupt)restoreStory(story)}
  useEffect(()=>{
    if(!open||!resumeRequest||resumeRequest.sequence===handledResume.current)return
    handledResume.current=resumeRequest.sequence
    const ordered=sortStories(stories),index=ordered.findIndex(item=>item.id===resumeRequest.id),target=ordered[index]
    if(!target){setNotice('该存档已不存在，请重新选择。');return}
    setView('stories');setStoryId(target.id);setCheckpointId(null);setPage(Math.floor(index/6));restoreStory(target)
  },[open,resumeRequest])
  const previewAction=(action:string)=>setNotice(onCreate?`${action}需要后续的检查点与演出实现，当前故事未改变。`:`${action}需要存档服务与演出模块；当前仅预览界面，不读写真实故事。`)
  const showDialog=(kind:'rename'|'delete')=>{
    if(!story)return
    setName(kind==='rename'?story.name:'');setError(null);setDialog(kind)
  }
  const confirmDialog=async()=>{
    if(!story||mutation.current||!review&&!onRename&&!onDelete)return
    mutation.current=true
    setMutating(true)
    try{
    if(dialog==='rename'){
      const validation=renameError(name)
      if(validation){setError(validation);return}
      const updated=onRename?await onRename(story,name):{...story,name:name.trim(),modifiedAt:new Date().toISOString()}
      setStories(old=>old.map(s=>s.id===story.id?updated:s));setPage(0)
    }else{
      if(name!==story.name){setError('请输入完整故事名称以确认。');return}
      await onDelete?.(story)
      const remaining=orderedStories.filter(s=>s.id!==story.id)
      setStories(remaining);setPage(paginate(remaining,page,true).page);setStoryId(null)
    }
    setDialog(null);setNotice(onRename||onDelete?'已保存到本机。':'已更新本次演示，未写入磁盘。')
    }catch(reason){setError(reason instanceof Error?reason.message:'操作失败，原存档未改变。')}finally{mutation.current=false;setMutating(false)}
  }
  const selected= view==='stories'?story:checkpoint
  const stateLabel=story?.status==='corrupt'?'存档损坏，需通过备份恢复。':story?.status==='migrating'?'存档迁移中，完成后才可继续。':story?.sourceMissing?'部分来源文件缺失，已有演出仍可恢复。':null
  return <section className="save-screen" data-open={open} data-testid="save-screen" inert={!open} aria-hidden={!open} aria-label="存档管理">
    <img className="save-screen__background" src={resources.url('background.library-hall-day')} alt=""/>
    <div className="save-screen__shade"/>
    <img className="save-screen__brand" src={resources.url('brand.logo.inverse')} alt="AF"/>
    <header className="save-screen__header"><button ref={back} className="quiet-button" onClick={leaveLayer} aria-label={view==='stories'?backLabel:'返回故事存档'}><Icon name="arrow-left" resources={resources}/></button><h1>{view==='stories'?'存档':`${story?.name??'故事'} · 保存点`}</h1><span>{view==='stories'?'STORIES':'CHECKPOINTS'}</span></header>
    {review&&<p className="save-screen__review">演示存档 · 仅本次界面预览，不写入磁盘</p>}
    <div className="save-browser">
      <div className="save-browser__tabs" role="tablist" aria-label="存档层级" onKeyDown={event=>{
        if(!(event.target as HTMLElement).matches('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
        event.preventDefault()
        const next=event.key==='Home'?'stories':event.key==='End'?'checkpoints':view==='stories'?'checkpoints':'stories'
        if(next===view)return
        if(next==='checkpoints'){toCheckpoints();if(!story)return}
        else leaveLayer()
        event.currentTarget.querySelector<HTMLButtonElement>(`#save-tab-${next}`)?.focus()
      }}>
        <button id="save-tab-stories" role="tab" aria-controls="save-content-panel" tabIndex={view==='stories'?0:-1} aria-selected={view==='stories'} onClick={()=>{if(view==='checkpoints')leaveLayer()}}>故事存档</button>
        <button id="save-tab-checkpoints" role="tab" aria-controls="save-content-panel" tabIndex={view==='checkpoints'?0:-1} aria-selected={view==='checkpoints'} onClick={toCheckpoints}>保存点</button>
        {view==='checkpoints'&&<div className="save-browser__filters" aria-label="保存点类型">{(['manual','auto','quick'] as const).map((kind,i)=><button key={kind} aria-pressed={filter===kind} onClick={()=>{setFilter(kind);setCheckpointId(null);setPage(0);setNotice(null)}}>{['手动','自动','快速'][i]}</button>)}</div>}
      </div>
      <div className="save-grid" id="save-content-panel" role="tabpanel" aria-labelledby={`save-tab-${view}`}>
        {Array.from({length:6},(_,index)=>{
          const item=listing.items[index]
          if(!item)return view==='stories'?<button key={`empty-${index}`} className={`save-card save-card--empty${index===listing.items.length?' save-card--create':''}`} onClick={create} aria-label={index===listing.items.length?'新建故事':`空位 ${listing.page*6+index+1}，新建故事`}><i className="save-card__empty-frame" aria-hidden="true"/><Icon name={index===listing.items.length?'plus':'file-empty'} resources={resources}/><strong>{index===listing.items.length?'新建故事':'空位'}</strong><span>{index===listing.items.length?'开始一段新的故事':'暂无存档'}</span></button>:<div key={`empty-${index}`} className="save-card save-card--vacant"><Icon name="file-empty" resources={resources}/><span>暂无{filter==='manual'?'手动':filter==='auto'?'自动':'快速'}保存点</span></div>
          const isStory='partner' in item
          const number=listing.page*6+index+1
          return <button key={item.id} className="save-card" aria-pressed={selected?.id===item.id} aria-label={`选择${view==='stories'?'故事':'保存点'} ${item.name}`} onClick={()=>{if(isStory)setStoryId(item.id);else setCheckpointId(item.id);setNotice(null)}}>
            <Thumbnail resources={resources} id={item.thumbnailId}/>
            <div className="save-card__caption"><strong><span>{String(number).padStart(2,'0')}</span>{item.name}</strong><div><span>{isStory?`${item.partner} · ${item.chapter}`:item.chapter}</span><time dateTime={isStory?storyModifiedAt(item):item.savedAt}>{displayTime(isStory?storyModifiedAt(item):item.savedAt)}</time></div>{isStory&&item.status!=='ready'&&<small>{item.status==='corrupt'?'存档损坏':'迁移中'}</small>}{!isStory&&item.corrupt&&<small>保存点损坏</small>}</div>
          </button>
        })}
      </div>
      <footer className="save-browser__footer"><nav className="save-pagination" aria-label="列表分页"><button className="quiet-button" disabled={listing.page===0} aria-label="上一页" onClick={()=>changePage(listing.page-1)}><Icon name="chevron-left" resources={resources}/></button><span aria-live="polite">{String(listing.page+1).padStart(2,'0')} <i>/</i> {String(listing.pages).padStart(2,'0')}</span><button className="quiet-button" disabled={listing.page===listing.pages-1} aria-label="下一页" onClick={()=>changePage(listing.page+1)}><Icon name="chevron-right" resources={resources}/></button></nav>{view==='stories'&&stories.length>0&&<button className="quiet-button" onClick={create}><Icon name="plus" resources={resources}/>新建故事</button>}</footer>
    </div>
    <aside className="save-detail" aria-label="当前选择详情">
      <p className="save-detail__eyebrow">当前选择 <span>/ {selected?String((view==='stories'?orderedStories:checkpoints).findIndex(s=>s.id===selected.id)+1).padStart(2,'0'):'—'}</span></p>
      {selected?<div className="save-detail__content" key={selected.id}>
        <h2>{selected.name}</h2><Thumbnail resources={resources} id={selected.thumbnailId}/>
        <dl><div><dt>搭档</dt><dd>{story?.partner}</dd></div><div><dt>主线</dt><dd>{selected.chapter}</dd></div><div><dt>{view==='stories'?'最后修改':'最后保存'}</dt><dd>{displayTime(view==='stories'&&story?storyModifiedAt(story):selected.savedAt)}</dd></div>{view==='checkpoints'&&checkpoint&&<div><dt>分支</dt><dd>{checkpoint.branch}</dd></div>}</dl>
        {(stateLabel||checkpoint?.corrupt)&&<p className="save-detail__warning">{checkpoint?.corrupt?'保存点损坏，请尝试其他保存点或备份。':stateLabel}</p>}
        <div className="save-detail__primary">
          <button className="save-primary" disabled={!story||!canResume(story)||!!checkpoint?.corrupt} onClick={resume}>{view==='stories'?'继续故事':'读取此处'}<span aria-hidden="true">→</span></button>
          <button className="save-secondary" disabled={view==='checkpoints'&&!!checkpoint?.corrupt} onClick={()=>view==='stories'?toCheckpoints():previewAction('只读回看')}>{view==='stories'?'查看保存点':'只读回看'}</button>
          {view==='checkpoints'&&<button className="save-secondary" disabled={checkpoint?.corrupt} onClick={()=>previewAction('从此分叉')}>从此分叉</button>}
        </div>
        {view==='stories'&&<div className="save-detail__actions"><button className="quiet-button" onClick={()=>showDialog('rename')}><Icon name="edit" resources={resources}/>重命名</button><button className="quiet-button" onClick={()=>previewAction('导出故事包')}><Icon name="upload" resources={resources}/>导出</button><details><summary aria-label="管理所选故事"><Icon name="more" resources={resources}/></summary><button onClick={()=>showDialog('delete')}>删除故事</button></details></div>}
      </div>:<div className="save-detail__empty"><Icon name="folder" resources={resources}/><h2>{view==='stories'?(stories.length?'选择一个故事':'还没有故事存档'):'选择一个保存点'}</h2><p>{view==='stories'?'每段故事都会保留自己的搭档与共同经历。':'保存点属于当前故事，选择后查看详情。'}</p>{view==='stories'&&<button className="save-primary" onClick={create}>新建故事 <span aria-hidden="true">→</span></button>}</div>}
    </aside>
    {notice&&<div className="save-screen__notice" role="status"><p>{notice}</p><button className="quiet-button" onClick={()=>setNotice(null)} aria-label="关闭存档提示"><Icon name="close" resources={resources}/></button></div>}
    <dialog ref={modal} className="save-dialog" onCancel={event=>{event.preventDefault();setDialog(null)}} aria-labelledby="save-dialog-title">
      <form onSubmit={event=>{event.preventDefault();confirmDialog()}}><h2 id="save-dialog-title">{dialog==='rename'?'重命名故事':'删除故事'}</h2><p>{dialog==='rename'?'名称长度为 1–64 个字。':'请输入完整故事名称以确认；只影响所选故事。'}</p>{dialog==='delete'&&<strong>{story?.name}</strong>}<label htmlFor="save-name">{dialog==='rename'?'故事名称':'确认故事名称'}</label><input id="save-name" ref={field} value={name} onChange={event=>{setName(event.target.value);setError(null)}} autoComplete="off"/>{error&&<p role="alert">{error}</p>}<small>{onRename||onDelete?'操作写入本机，仅影响当前故事。':'仅修改本次演示，不写入磁盘。'}</small><div><button type="button" className="save-secondary" onClick={()=>setDialog(null)}>取消</button><button className="save-primary" type="submit">{dialog==='rename'?'保存名称':'确认删除'}</button></div></form>
    </dialog>
    {creating&&onCreate&&<CreateStoryDialog companions={companions} selectedId={selectedCompanionId} onClose={()=>setCreating(false)} onCreate={async values=>{const created=await onCreate(values);setStories(old=>[created,...old.filter(s=>s.id!==created.id)]);setCreating(false);setView('stories');setStoryId(created.id);setPage(0);setNotice('故事已创建并保存在本机，可点击“继续故事”激活；主线剧本尚未生成。')}}/>}
  </section>
}
