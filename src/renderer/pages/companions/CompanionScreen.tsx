import {useEffect,useLayoutEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {CompanionPortrait} from './CompanionPortrait'
import {CompanionEditor} from './CompanionEditor'
import {blankCompanion,copyCompanion,decodeCompanion,encodeCompanion,MAX_COMPANION_BYTES,validateCompanion,type CompanionView,type PoseId} from './model'
import './companions.css'

const tabNames=['人物档案','相处设定','外观资源','故事记录'] as const
type Tab=typeof tabNames[number]
export function CompanionScreen({open,resources,onBack,onSelect,items,onItemsChange,selectedCompanionId,backLabel='返回首页'}:{open:boolean;resources:ResourceCatalog;onBack:()=>void;onSelect:(companion:CompanionView)=>boolean;items:CompanionView[];onItemsChange:Dispatch<SetStateAction<CompanionView[]>>;selectedCompanionId:string;backLabel?:string}){
  const [imageBusy,setImageBusy]=useState(false)
  const setItems=onItemsChange
  const [view,setView]=useState<'library'|'detail'|'editor'>('library'),[selectedId,setSelectedId]=useState('af-guide'),[tab,setTab]=useState<Tab>('人物档案')
  const [filter,setFilter]=useState<'all'|'preset'|'custom'>('all'),[search,setSearch]=useState(''),[pose,setPose]=useState<PoseId|null>(null)
  const [editor,setEditor]=useState<CompanionView|null>(null),[editorBase,setEditorBase]=useState(''),[editorReturn,setEditorReturn]=useState<'library'|'detail'>('library')
  const [notice,setNotice]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[dialog,setDialog]=useState<'leave'|'delete'|null>(null),[deleteId,setDeleteId]=useState<string|null>(null),[confirmName,setConfirmName]=useState('')
  const root=useRef<HTMLElement>(null),back=useRef<HTMLButtonElement>(null),rail=useRef<HTMLDivElement>(null),railOffset=useRef(0),modal=useRef<HTMLDialogElement>(null),importInput=useRef<HTMLInputElement>(null),wasOpen=useRef(false),modalOrigin=useRef<HTMLElement|null>(null)
  const selected=items.find(item=>item.id===selectedId)
  const selectedPose=pose&&selected?.poses.some(tag=>tag.id===pose)?pose:selected?.defaultPose??''
  const deleting=items.find(item=>item.id===deleteId)
  const visible=items.filter(item=>(filter==='all'||(filter==='preset'?item.builtIn:!item.builtIn))&&`${item.name} ${item.sourceWork}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const location=useRef({open,view});location.current={open,view}
  useEffect(()=>{
    const element=rail.current;if(!open||view!=='library'||!element)return
    const wheel=(event:WheelEvent)=>{if(event.ctrlKey||Math.abs(event.deltaY)<=Math.abs(event.deltaX)||element.scrollWidth<=element.clientWidth)return;const previous=element.scrollLeft;element.scrollLeft+=event.deltaY;if(element.scrollLeft!==previous)event.preventDefault()}
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel)
  },[open,view])
  useLayoutEffect(()=>{if(open&&!wasOpen.current)setView('library');wasOpen.current=open},[open])
  const focusBack=()=>requestAnimationFrame(()=>back.current?.focus({preventScroll:true}))
  useEffect(()=>{
    if(!open){setNotice(null);return}
    const frame=requestAnimationFrame(()=>{
      if(view==='library'&&rail.current)rail.current.scrollLeft=railOffset.current
      ;(view==='editor'?root.current?.querySelector<HTMLInputElement>('[name="companion-name"]'):back.current)?.focus({preventScroll:true})
    });return()=>cancelAnimationFrame(frame)
  },[open,view])
  useEffect(()=>{
    if(!dialog)return
    modalOrigin.current=document.activeElement as HTMLElement;modal.current?.showModal()
    return()=>{modal.current?.close();(modalOrigin.current?.isConnected?modalOrigin.current:back.current)?.focus({preventScroll:true})}
  },[dialog])
  const edit=(source?:CompanionView,copy=false)=>{
    const next=source?(copy||source.builtIn?copyCompanion(source,crypto.randomUUID()):{...source,sprites:{...source.sprites},poses:source.poses.map(tag=>({...tag}))}):blankCompanion(crypto.randomUUID())
    setEditorReturn(view==='detail'?'detail':'library');setEditor(next);setEditorBase(JSON.stringify(next));setError(null);setNotice(null);setView('editor')
  }
  const leaveEditor=()=>{
    if(editor&&JSON.stringify(editor)!==editorBase){setDialog('leave');return}
    setView(editorReturn);setEditor(null);setError(null)
  }
  const goBack=()=>{
    if(view==='editor')leaveEditor()
    else if(view==='detail'){setView('library');setNotice(null)}
    else onBack()
  }
  useEffect(()=>{
    if(!open)return
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||event.keyCode===229||dialog)return
      const details=(event.target as HTMLElement).closest<HTMLDetailsElement>('details[open]')
      if(details){event.preventDefault();details.open=false;details.querySelector<HTMLElement>('summary')?.focus();return}
      event.preventDefault()
      if(notice){setNotice(null);focusBack()}else goBack()
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[open,view,notice,dialog,editor,editorBase,editorReturn,onBack])
  const showDetail=(id:string)=>{setSelectedId(id);setTab('人物档案');setPose(null);setNotice(null);setView('detail')}
  const save=(draft:boolean)=>{
    if(!editor)return
    if(imageBusy){setError('正在读取立绘，请完成后保存。');return}
    const message=validateCompanion(editor,draft);if(message){setError(message);return}
    if(!draft&&editor.sprites[editor.defaultPose]&&!editor.sprites[editor.defaultPose]!.startsWith('data:image/png;base64,')&&!resources.has(editor.sprites[editor.defaultPose]!)){setError('默认立绘资源不可用，请重新添加或保存草稿。');return}
    const next={...editor,name:editor.name.trim(),draft,sprites:{...editor.sprites},poses:editor.poses.map(tag=>({...tag,label:tag.label.trim()}))}
    setItems(old=>old.some(item=>item.id===next.id)?old.map(item=>item.id===next.id?next:item):[...old,next])
    setEditor(null);setError(null);showDetail(next.id);setNotice('已保存到本次前端预览。重启后不保留，可导出预览包。')
  }
  const exportItem=(item:CompanionView)=>{
    const url=URL.createObjectURL(new Blob([encodeCompanion(item)],{type:'application/json'}))
    const anchor=document.createElement('a');anchor.href=url;anchor.download=item.name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_')+'.af-companion.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000)
    setNotice('已生成搭档 JSON 预览包；不包含故事经历、凭据或模型配置。')
  }
  const importItem=async(file:File)=>{
    try{if(file.size>MAX_COMPANION_BYTES)throw new Error('请选择不超过 64MB 的搭档预览包。');const item=decodeCompanion(await file.text(),crypto.randomUUID());for(const image of Object.values(item.sprites)){if(!image)continue;if(image.startsWith('data:image/png;base64,')){const decoded=new Image();decoded.src=image;await decoded.decode()}else if(!resources.has(image))throw new Error('搭档包引用了不可用的立绘，请先补齐资源。')}if(!location.current.open||location.current.view!=='library')return;setItems(old=>[...old,item]);showDetail(item.id);setNotice('搭档已导入本次预览，不覆盖已有模板或故事。')}
    catch(reason){setNotice(reason instanceof Error?reason.message:'导入失败，原有搭档未改变。')}
  }
  const manageDelete=(item:CompanionView)=>{setDeleteId(item.id);setConfirmName('');setError(null);setDialog('delete')}
  const confirmedDelete=()=>{
    if(!deleting||deleting.builtIn)return
    if(confirmName!==deleting.name){setError('请输入完整搭档姓名以确认。');return}
    setItems(old=>old.filter(item=>item.id!==deleting.id));setDialog(null);setView('library');setSelectedId('af-guide');setNotice('已从本次搭档库移除；已有故事不受影响。')
  }
  return <section ref={root} className="companion-screen" data-open={open} data-testid="companion-screen" inert={!open} aria-hidden={!open} aria-label="搭档档案">
    <img className="companion-screen__background" src={resources.url('background.library-hall-day')} alt=""/><div className="companion-screen__shade"/>
    <img className="companion-screen__brand" src={resources.url('brand.logo.inverse')} alt="AF"/>
    <header className="companion-screen__header"><button ref={back} className="quiet-button" data-ui-sound="back" onClick={goBack} aria-label={view==='library'?backLabel:view==='detail'?'返回搭档库':'返回搭档档案'}><Icon name="arrow-left" resources={resources}/></button><h1>{view==='editor'?'编辑搭档':'搭档档案'}</h1></header>
    {view!=='library'&&<nav className="companion-breadcrumb" aria-label="档案位置"><button onClick={()=>view==='editor'?leaveEditor():setView('library')}>搭档库</button><span>/</span><span>{view==='editor'?editor?.name:selected?.name}</span>{view==='editor'&&<span>/ 编辑</span>}</nav>}
    {view==='library'?<>
      <nav className="companion-library__filters" aria-label="搭档分类">{(['all','preset','custom'] as const).map((type,i)=><button key={type} aria-pressed={filter===type} onClick={()=>{setFilter(type);railOffset.current=0;if(rail.current)rail.current.scrollLeft=0}}>{['全部','预置搭档','我的搭档'][i]}</button>)}</nav>
      <div className="companion-library__tools"><label><Icon name="search" resources={resources}/><input aria-label="搜索搭档" placeholder="搜索搭档" value={search} onChange={event=>{setSearch(event.target.value);railOffset.current=0;if(rail.current)rail.current.scrollLeft=0}}/></label><button className="save-secondary" onClick={()=>importInput.current?.click()}><Icon name="download" resources={resources}/>导入</button><button className="save-primary" onClick={()=>edit()}><Icon name="plus" resources={resources}/>新建搭档</button></div>
      <input ref={importInput} type="file" accept=".json,application/json" aria-label="导入搭档预览包" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importItem(file)}}/>
      <div ref={rail} className="companion-library__rail" tabIndex={0} aria-label="可水平滚动的搭档列表" onScroll={event=>{railOffset.current=event.currentTarget.scrollLeft}}>
        {visible.map(item=><article key={item.id} className="companion-card" data-selected={selectedId===item.id}><button className="companion-card__open" aria-label={`查看 ${item.name} 档案`} onClick={()=>showDetail(item.id)}><div className="companion-card__portrait"><CompanionPortrait image={item.sprites[item.defaultPose]} resources={resources} name={item.name}/></div><div className="companion-card__caption"><h2 title={item.name}>{item.name}</h2><div className="companion-tags"><span>{item.builtIn?'预置':item.sourceKind==='existing'?'作品角色':'自设'}</span>{item.draft&&<span className="companion-tag--draft">草稿</span>}</div></div></button><details className="companion-card__menu"><summary aria-label={`管理 ${item.name}`}><Icon name="more" resources={resources}/></summary><div><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');edit(item,true)}}>创建副本</button><button onClick={()=>exportItem(item)}>导出预览包</button><button disabled={item.builtIn} onClick={()=>manageDelete(item)}>删除搭档</button></div></details></article>)}
        {!visible.length&&search&&<div className="companion-library__empty"><h2>没有匹配的搭档</h2><button className="save-secondary" onClick={()=>setSearch('')}>清空搜索</button></div>}
        <button className="companion-card companion-card--create" aria-label="新建搭档卡片" onClick={()=>edit()}><Icon name="plus" resources={resources}/><strong>新建搭档</strong></button>
      </div>
    </>:view==='editor'&&editor?<CompanionEditor key={editor.id} value={editor} onChange={value=>{setEditor(value);setError(null)}} onSave={save} onBusyChange={setImageBusy} onCancel={leaveEditor} resources={resources} error={error}/>:selected?<div className="companion-dossier">
      <aside className="companion-dossier__person"><CompanionPortrait image={selected.sprites[selectedPose]??selected.sprites[selected.defaultPose]} resources={resources} name={selected.name}/><div className="companion-nameplate"><h2>{selected.name}</h2><p>{selected.sourceWork||(selected.sourceKind==='original'?'原创 / 自设':'已有作品角色')}</p><span>搭档模板{selected.draft?' · 草稿':''}</span></div></aside>
      <section className="companion-dossier__panel" aria-label="搭档详细资料"><div className="companion-tabs" role="tablist" aria-label="档案分类" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||(event.target as HTMLElement).getAttribute('role')!=='tab')return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?3:(tabNames.indexOf(tab)+(event.key==='ArrowRight'?1:3))%4;setTab(tabNames[index]);event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${index}"]`)?.focus()}}>{tabNames.map((name,index)=><button key={name} id={`companion-tab-${index}`} data-tab={index} role="tab" aria-selected={tab===name} tabIndex={tab===name?0:-1} aria-controls="companion-tabpanel" onClick={()=>setTab(name)}>{name}</button>)}</div>
        <div className="companion-dossier__content" id="companion-tabpanel" role="tabpanel" aria-labelledby={`companion-tab-${tabNames.indexOf(tab)}`}>
          {tab==='人物档案'?<><h2>关于 {selected.name}</h2><div className="companion-facts"><p><Icon name="file-text" resources={resources}/><span>来源</span>{selected.sourceWork||'原创 / 自设'}</p><p><Icon name="folder" resources={resources}/><span>背景</span>{selected.background||'未指定'}</p></div><section><h3><Icon name="chat" resources={resources}/>性格与表达{selected.examples&&<small>设定示例</small>}</h3><p>{selected.personality||'尚未填写人物设定。'}</p></section><section><h3><Icon name="book-open" resources={resources}/>知识范围</h3><p>{selected.knowledge||'尚未指定。仅依据实际经历和获知的信息回应。'}</p></section><section><h3><Icon name="file-text" resources={resources}/>档案说明</h3><p>相同搭档在不同故事中的经历分别保存。</p></section></>:tab==='相处设定'?<><h2>与你的相处</h2><dl className="companion-relations">{[['搭档身份',selected.partnerIdentity],['用户身份',selected.userIdentity],['对用户的称呼',selected.address||'未指定，使用“你”等自然称呼'],['关系起点',selected.relationship],['现实背景',selected.background],['主动性',selected.initiative]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'未指定'}</dd></div>)}</dl><p className="companion-muted">这些是新故事的默认设定。用户姓名在全局设置中单独管理，不沿用原作主角姓名。</p></>:tab==='外观资源'?<><h2>立绘资源</h2><div className="companion-pose-grid">{selected.poses.map(({id,label})=><button key={id} aria-label={label} aria-pressed={selectedPose===id} onClick={()=>setPose(id)}><CompanionPortrait image={selected.sprites[id]} resources={resources} name={label}/><span>{label}{id===selected.defaultPose?' · 默认':''}{selected.sprites[id]?'':' · 未添加'}</span></button>)}</div>{!selected.sprites[selectedPose]&&<p role="status">此标签尚未添加图片，左侧使用默认立绘预览。</p>}</>:<div className="companion-history-empty"><Icon name="history" resources={resources}/><h2>暂无关联故事</h2><p>每个故事拥有独立的关系、约定和共同经历。故事与记忆服务尚未接入，不会用模板设定冒充相处记录。</p></div>}
        </div>
        <footer className="companion-dossier__footer"><div><button className="save-secondary" onClick={()=>edit(selected)}>编辑搭档</button><button className="save-primary" disabled={selected.draft} aria-pressed={selectedCompanionId===selected.id} data-ui-sound="confirm" onClick={()=>{if(onSelect(selected))setNotice(`已选中 ${selected.name}，返回首页即可查看。`);else setNotice('搭档设定或默认立绘不可用，请先完成编辑。')}}>{selectedCompanionId===selected.id?'已选中':'选中'}</button></div><p>{selected.builtIn?'编辑预置搭档会创建副本，保留原始模板。':'模板修改不覆盖已有故事。'}</p></footer>
      </section>
    </div>:null}
    {notice&&<div className="companion-notice" role="status"><p>{notice}</p><button className="quiet-button" data-ui-sound="back" aria-label="关闭搭档提示" onClick={()=>{setNotice(null);focusBack()}}><Icon name="close" resources={resources}/></button></div>}
    <dialog ref={modal} className="companion-dialog" aria-labelledby="companion-dialog-title" onCancel={event=>{event.preventDefault();setDialog(null)}}><h2 id="companion-dialog-title">{dialog==='leave'?'尚有未保存的修改':'删除搭档'}</h2>{dialog==='leave'?<><p>可以保存为草稿、放弃修改，或继续编辑。</p><div><button className="save-secondary" onClick={()=>setDialog(null)}>继续编辑</button><button className="save-secondary" data-ui-sound="back" onClick={()=>{setDialog(null);setView(editorReturn);setEditor(null);setError(null)}}>放弃修改</button><button className="save-primary" data-ui-sound="confirm" disabled={imageBusy} onClick={()=>{if(editor){const message=validateCompanion(editor,true);if(message){setError(message);setDialog(null)}else{setDialog(null);save(true)}}}}>保存草稿</button></div></>:<form onSubmit={event=>{event.preventDefault();confirmedDelete()}}><p>只从搭档库删除此模板，不删除已有故事。请输入完整姓名确认：</p><strong>{deleting?.name}</strong><label>确认搭档姓名<input value={confirmName} onChange={event=>{setConfirmName(event.target.value);setError(null)}}/></label>{error&&<p role="alert">{error}</p>}<div><button className="save-secondary" type="button" onClick={()=>setDialog(null)}>取消</button><button className="save-primary" data-ui-sound="confirm" type="submit">确认删除</button></div></form>}</dialog>
  </section>
}
