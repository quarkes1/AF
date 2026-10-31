import {SourceFolders} from './SourceFolders'
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {focusWhenVisible} from '../../components/focus'
import {HOME_BACKGROUNDS} from '../home/backgrounds'
import {HOME_MUSIC} from '../home/music'
import {ILLUSTRATIONS,MUSIC_TRACKS} from './application-resources'
import {MaterialLibrary,type ImportProgress} from './library'
import {acceptsFile,formatBytes,needsImportEstimate,type LibraryItem,type LibraryKind} from './model'
import {LibraryDetail,type ResourceView,type PreviewAudioPreferences} from './LibraryDetail'
import './materials.css'
import {DocumentIcon} from './DocumentIcon'

interface Props{audioPreferences:PreviewAudioPreferences;open:boolean;library:MaterialLibrary;resources:ResourceCatalog;onBack:()=>void;backLabel?:string;background:string;musicId:string;onUseBackground:(id:string)=>void;onUseMusic:(id:string)=>Promise<boolean>;onPreviewBackground:(id:string)=>void;onAudition:(active:boolean,resume?:boolean)=>void}
type Dialog={kind:'rename'|'remove';item:LibraryItem}|{kind:'scan';files:File[];target:LibraryKind;folder:boolean;ignored:string[]}
export function MaterialScreen({audioPreferences,open,library,resources,onBack,backLabel='返回首页',background,musicId,onUseBackground,onUseMusic,onPreviewBackground,onAudition}:Props){
  const {items,warning,jobs,sourceAnchor}=useSyncExternalStore(library.subscribe,library.getSnapshot)
  const [tab,setTab]=useState<'documents'|'resources'>('documents'),[kind,setKind]=useState<'background'|'music'>('background'),[filter,setFilter]=useState('all'),[source,setSource]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState<string|null>(null)
  const [progress,setProgress]=useState<ImportProgress|null>(null),[importing,setImporting]=useState(false),[notice,setNotice]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[dialog,setDialog]=useState<Dialog|null>(null),[name,setName]=useState(''),[dialogBusy,setDialogBusy]=useState(false),[previewErrors,setPreviewErrors]=useState<Record<string,string>>({})
  const [deleteCopy,setDeleteCopy]=useState(false)
  useEffect(()=>{if(dialog?.kind==='remove')setDeleteCopy(false)},[dialog])
  const root=useRef<HTMLElement>(null),back=useRef<HTMLButtonElement>(null),files=useRef<HTMLInputElement>(null),folder=useRef<HTMLInputElement>(null),abort=useRef<AbortController|null>(null),modal=useRef<HTMLDialogElement>(null),origin=useRef<HTMLElement|null>(null),selectedButton=useRef<HTMLElement|null>(null)
  const documents=items.filter(item=>item.kind==='document')
  const subjects=[...new Set(documents.map(item=>item.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'))
  const target:LibraryKind=tab==='documents'?'document':kind
  const builtIns:ResourceView[]=(kind==='background'?ILLUSTRATIONS.map(item=>({...item,kind,builtIn:true})):MUSIC_TRACKS.map(([id,name])=>({id,name,kind,builtIn:true}))).filter(item=>resources.has(item.id))
  const resourceItems:ResourceView[]=[...builtIns,...items.filter(item=>item.kind===kind).map(item=>({id:item.id,name:item.name,kind,builtIn:false,item}))]
  const entries:(LibraryItem|ResourceView)[]=tab==='documents'?documents.filter(item=>filter==='all'||filter==='unclassified'&&!item.subject||filter==='errors'&&(previewErrors[item.id]||item.state==='failed')||filter===`subject:${item.subject}`):resourceItems.filter(item=>source==='all'||source==='built-in'&&item.builtIn||source==='custom'&&!item.builtIn)
  const visible=entries.filter(item=>`${item.name} ${'filename'in item?item.filename:''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const detail=entries.find(item=>item.id===selected)
  const custom=detail?('blob'in detail?detail:detail.item):undefined
  const reportPreview=useCallback((id:string,message:string|null)=>setPreviewErrors(current=>{if(current[id]===(message??undefined))return current;const next={...current};if(message)next[id]=message;else delete next[id];return next}),[])
  const closeDetail=()=>{setSelected(null);return focusWhenVisible(()=>selectedButton.current?.isConnected?selectedButton.current:back.current)}
  useEffect(()=>{if(open)return focusWhenVisible(()=>back.current)},[open])
  useEffect(()=>{
    if(!open)return
    const key=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.isComposing||event.defaultPrevented||dialog)return;event.preventDefault();if(selected)closeDetail();else onBack()}
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[open,selected,dialog,onBack])
  useEffect(()=>{if(!dialog)return;origin.current=document.activeElement as HTMLElement;modal.current?.showModal();return()=>{modal.current?.close();origin.current?.isConnected&&origin.current.focus({preventScroll:true})}},[dialog])
  useEffect(()=>{if(sourceAnchor){setTab('documents');setFilter('all');setSearch('');setSelected(sourceAnchor.id)}},[sourceAnchor?.revision])
  const changeTab=(value:'documents'|'resources')=>{setSelected(null);setTab(value);setSearch('');setError(null)}
  const changeKind=(value:'background'|'music')=>{setSelected(null);setKind(value);setSearch('');setError(null)}
  const runImport=async(batch:File[],importKind:LibraryKind)=>{
    setDialog(null);setError(null);setNotice(null);setImporting(true);const controller=new AbortController();abort.current=controller
    try{const result=await library.import(batch,importKind,setProgress,controller.signal);setNotice(`${controller.signal.aborted?'已停止后续导入':'导入结束'}：完成 ${result.completed} / ${result.total}，重复 ${result.duplicates}，失败 ${result.failures.length}。`)}
    catch(reason){setError(reason instanceof Error?reason.message:'导入失败。')}
    finally{setImporting(false);abort.current=null}
  }
  const chooseFiles=(list:FileList|null,isFolder=false)=>{
    if(!list)return
    const batch=Array.from(list),supported=batch.filter(file=>acceptsFile(target,file.name))
    if(!supported.length){setError('没有找到此分类支持的文件。');return}
    if(isFolder||needsImportEstimate(supported)||supported.length!==batch.length){setDialog({kind:'scan',files:supported,target,folder:isFolder,ignored:batch.filter(file=>!acceptsFile(target,file.name)).map(file=>file.name)});return}
    void runImport(supported,target)
  }
  const saveDialog=async()=>{
    if(!dialog||dialog.kind==='scan')return
    setDialogBusy(true);setError(null)
    try{
      if(dialog.kind==='rename')await library.update(dialog.item.id,{name})
      else{
        if(dialog.item.id===musicId){const fallback=HOME_MUSIC.find(([id])=>resources.has(id));if(!fallback||!await onUseMusic(fallback[0]))throw new Error('切换到内置音乐失败，资源尚未移除。')}
        if(dialog.item.id===background){const fallback=HOME_BACKGROUNDS.find(([id])=>resources.has(id));if(!fallback)throw new Error('没有可用的替代背景，资源尚未移除。');onUseBackground(fallback[0])}
        await library.remove(dialog.item.id,deleteCopy);setSelected(null)
      }
      setDialog(null)
    }catch(reason){setError(reason instanceof Error?reason.message:'操作失败。')}
    finally{setDialogBusy(false)}
  }
  const select=(entry:LibraryItem|ResourceView,element:HTMLElement)=>{selectedButton.current=element;setSelected(entry.id);setError(null)}
  const url=(entry:LibraryItem|ResourceView)=>'blob'in entry?library.url(entry):entry.item?library.url(entry.item):resources.url(entry.id)
  return <section ref={root} className="materials-screen" data-open={open} inert={!open} aria-hidden={!open} aria-label="资料管理">
    <img className="materials-screen__background" src={resources.url('background.library-hall-day')} alt=""/>
    <header className="materials-screen__header"><img src={resources.url('brand.logo.inverse')} alt="AF"/><button ref={back} className="quiet-button" aria-label={backLabel} data-ui-sound="back" onClick={onBack}>←</button><h1>资料管理</h1></header>
    <div className="materials-screen__toolbar"><nav aria-label="资料管理类别"><button aria-pressed={tab==='documents'} onClick={()=>changeTab('documents')}>学习资料</button><button aria-pressed={tab==='resources'} onClick={()=>changeTab('resources')}>应用资源</button></nav>
      <div className="materials-screen__tools"><button disabled={importing} onClick={()=>files.current?.click()}><Icon name="plus" resources={resources}/>{tab==='documents'?'添加文件':kind==='background'?'导入插画':'导入音乐'}</button>{tab==='documents'&&library.backend&&<button disabled={importing||!documents.length} onClick={()=>void library.process(documents.filter(d=>!d.manualOverride&&d.blocks).map(d=>d.id),true).catch(reason=>setError(reason instanceof Error?reason.message:'归类失败。'))}>自动整理科目</button>}{tab==='documents'&&<button disabled={importing} onClick={()=>folder.current?.click()}><Icon name="folder" resources={resources}/>选择文件夹</button>}<input type="search" aria-label="搜索资料或资源" placeholder={tab==='documents'?'搜索资料':'搜索资源'} value={search} onChange={event=>setSearch(event.target.value)}/></div>
    </div>
    <input hidden ref={files} type="file" multiple aria-label="导入文件" accept={target==='document'?'.doc,.docx,.ppt,.pptx,.pdf,.md,.txt':target==='background'?'.png,.jpg,.jpeg,.webp':'.mp3,.wav,.ogg,.flac,.m4a'} onChange={event=>{chooseFiles(event.currentTarget.files);event.currentTarget.value=''}}/>
    <input hidden ref={folder} type="file" multiple {...{webkitdirectory:''}} aria-label="选择资料文件夹" onChange={event=>{chooseFiles(event.currentTarget.files,true);event.currentTarget.value=''}}/>
    <div className="materials-workspace" data-detail={!!detail}>
      <aside className="materials-sidebar materials-panel">{tab==='documents'?<>
        <button aria-pressed={filter==='all'} onClick={()=>{setFilter('all');setSelected(null)}}><Icon name="folder" resources={resources}/><span>全部资料</span><small>{documents.length}</small></button>
        {subjects.map(subject=><button key={subject} title={subject} aria-pressed={filter===`subject:${subject}`} onClick={()=>{setFilter(`subject:${subject}`);setSelected(null)}}><Icon name="folder" resources={resources}/><span>{subject}</span><small>{documents.filter(item=>item.subject===subject).length}</small></button>)}
        <hr/><button aria-pressed={filter==='unclassified'} onClick={()=>{setFilter('unclassified');setSelected(null)}}><span>待归类</span><small>{documents.filter(item=>!item.subject).length}</small></button><button aria-pressed={filter==='errors'} onClick={()=>{setFilter('errors');setSelected(null)}}><span>预览异常</span><small>{documents.filter(item=>previewErrors[item.id]||item.state==='failed').length}</small></button>
      </>:<>
        <button aria-pressed={kind==='background'} onClick={()=>changeKind('background')}><Icon name="image" resources={resources}/><span>Illustration</span></button><button aria-pressed={kind==='music'} onClick={()=>changeKind('music')}><Icon name="music" resources={resources}/><span>Music</span></button><hr/><p>资源来源</p>{[['all','全部'],['built-in','内置'],['custom','自定义']].map(([id,label])=><button key={id} aria-pressed={source===id} onClick={()=>{setSource(id);setSelected(null)}}>{label}</button>)}
      </>}</aside>
      <section className="materials-content materials-panel">{tab==='documents'&&library.backend&&<SourceFolders library={library}/>}<header><h2>{tab==='documents'?(filter.startsWith('subject:')?filter.slice(8):filter==='unclassified'?'待归类':filter==='errors'?'预览异常':'全部资料'):kind==='background'?'Illustration':'Music'}</h2><span>{visible.length} {tab==='documents'?'份资料':'项资源'}</span></header>
        <div className={`materials-content__scroll ${tab==='documents'?'materials-files':kind==='background'?'materials-grid':'materials-tracks'}`}>
          {!visible.length&&<div className="materials-empty"><Icon name={tab==='documents'?'folder':kind==='background'?'image':'music'} resources={resources}/><h3>{search?'没有匹配内容':tab==='documents'?'添加你的学习资料':'这里还没有资源'}</h3><p>{search?'试试其他关键词。':tab==='documents'?'选择文件或文件夹，查看实际内容并整理分类。':'从上方导入图片或音乐。'}</p>{search&&<button onClick={()=>setSearch('')}>清空搜索</button>}</div>}
          {tab==='documents'&&!!visible.length&&<div className="materials-file-heading"><span>文件名称</span><span>类型</span><span>状态</span></div>}
          {visible.map(entry=>tab==='documents'&&'blob'in entry?<button key={entry.id} className="materials-file" aria-label={`查看资料 ${entry.name}`} aria-pressed={selected===entry.id} onClick={event=>select(entry,event.currentTarget)}><span className="materials-file__name"><DocumentIcon extension={entry.extension}/><span title={entry.filename}>{entry.name}.{entry.extension}</span></span><span>{entry.extension.toUpperCase()}</span><span className="materials-file__status">{previewErrors[entry.id]?'预览异常':entry.state?({queued:'排队中',parsing:'解析中',ready:'已解析',partial:'部分可用',failed:'处理失败',needs_review:'需核对'} as Record<string,string>)[entry.state]:['doc','ppt'].includes(entry.extension)?'待转换':'已导入'}</span></button>:<button key={entry.id} className={kind==='background'?'materials-resource-card':'materials-track'} aria-label={`查看资源 ${entry.name}`} aria-pressed={selected===entry.id} onClick={event=>select(entry,event.currentTarget)}>
            {kind==='background'?<img src={url(entry)} alt="" draggable="false" data-art-role={'role'in entry?entry.role:'background'}/>:<Icon name="music" resources={resources}/>}
            {kind==='music'&&<span className="materials-resource-caption"><strong title={entry.name}>{entry.name}</strong><small>{'builtIn'in entry&&entry.builtIn?'内置':'自定义'}</small></span>}{entry.id===(kind==='background'?background:musicId)&&<span className="materials-in-use">已使用</span>}
          </button>)}
        </div>
        {!!jobs?.length&&tab==='documents'&&<div className="materials-import"><details><summary>后台处理任务 · {jobs.filter(j=>['queued','running'].includes(j.status)).length} 项进行中</summary>{jobs.map(job=><p key={job.id}>{({parse:'解析资料',resourceClassify:'科目归类',courseNameReview:'名称审查',textbookIdentify:'教材识别',providerTest:'模型连接',scan:'扫描来源',import:'导入副本'} as Record<string,string>)[job.purpose]} · {({queued:'排队中',running:'处理中',waiting_user:'等待确认',completed:'已完成',failed:'失败',cancelled:'已取消',superseded:'已替换'} as Record<string,string>)[job.status]} · {job.completed}/{job.total}{job.error&&` · ${job.error}`}{['queued','running'].includes(job.status)&&<button onClick={()=>void library.backend?.call('jobs.cancel',{jobId:job.id},job.id).then(()=>library.refresh())}>取消任务</button>}</p>)}</details></div>}
        {(progress||notice)&&<footer className="materials-import"><span role="status">{importing?`正在导入 ${progress?.completed??0} / ${progress?.total??0}：${progress?.filename??''}`:notice}</span>{importing&&<button onClick={()=>abort.current?.abort()}>取消后续导入</button>}{!!progress?.failures.length&&<details><summary>查看 {progress.failures.length} 个失败项目</summary>{progress.failures.map((failure,index)=><p key={index}>{failure.name}：{failure.reason}</p>)}</details>}</footer>}
      </section>
      <aside className="materials-detail materials-panel" aria-label="选中项目详情" aria-hidden={!detail} inert={!detail}>{detail&&open&&<LibraryDetail library={library} audioPreferences={audioPreferences} key={detail.id} entry={detail} resources={resources} url={url(detail)} active={detail.id===(detail.kind==='background'?background:musicId)} onUpdate={patch=>library.update(detail.id,patch)} onClose={closeDetail} onRename={()=>{if(custom){setName(custom.name);setDialog({kind:'rename',item:custom});setError(null)}}} onRemove={()=>{if(custom){setDialog({kind:'remove',item:custom});setError(null)}}} onUse={async()=>{if(detail.kind==='background'){onUseBackground(detail.id);return true}return onUseMusic(detail.id)}} onPreview={()=>onPreviewBackground(detail.id)} onResult={reportPreview} onAudition={onAudition}/>}</aside>
    </div>
    {(warning||error)&&!dialog&&<p className="materials-screen__error" role="status">{error??warning}</p>}
    {dialog&&<dialog ref={modal} className="materials-dialog" onCancel={event=>{event.preventDefault();if(!dialogBusy)setDialog(null)}}>
      <h2>{dialog.kind==='scan'?'确认导入':dialog.kind==='rename'?'重命名':dialog.item.kind==='document'?'移除资料':'移除资源'}</h2>
      {dialog.kind==='scan'?<><p>发现 {dialog.files.length} 个支持的文件，共 {formatBytes(dialog.files.reduce((sum,file)=>sum+file.size,0))}。</p><p>文件副本将保存在本机。{dialog.folder?'当前为一次性导入，不持续监视文件夹。':''}</p><ul>{dialog.files.slice(0,50).map((file,index)=><li key={index}>{file.name} · {formatBytes(file.size)}</li>)}</ul>{dialog.files.length>50&&<p>另有 {dialog.files.length-50} 个文件。</p>}{!!dialog.ignored.length&&<details><summary>跳过 {dialog.ignored.length} 个不支持的文件</summary><ul>{dialog.ignored.slice(0,50).map((name,index)=><li key={index}>{name}：此分类不支持</li>)}</ul></details>}<div className="materials-dialog__actions"><button onClick={()=>setDialog(null)}>取消</button><button className="materials-primary" onClick={()=>void runImport(dialog.files,dialog.target)}>开始导入</button></div></>:<form onSubmit={event=>{event.preventDefault();void saveDialog()}}>
        {dialog.kind==='rename'?<label className="materials-field">名称<input autoFocus aria-label="新的资源名称" maxLength={160} required value={name} onChange={event=>setName(event.target.value)}/></label>:<p>将从当前资料库移除“{dialog.item.name}”，原文件不会被删除。{[background,musicId].includes(dialog.item.id)?'正在使用的资源会先切换到内置资源。':''}</p>}
        {dialog.kind==='remove'&&<label className="materials-field"><span><input type="checkbox" checked={deleteCopy} onChange={e=>setDeleteCopy(e.target.checked)}/>同时删除未被证据引用的受管副本</span><small>被教材或历史证据引用的快照继续保留。</small></label>}
        {error&&<p role="alert" className="materials-error">{error}</p>}<div className="materials-dialog__actions"><button type="button" disabled={dialogBusy} onClick={()=>setDialog(null)}>取消</button><button className="materials-primary" disabled={dialogBusy||dialog.kind==='rename'&&!name.trim()}>{dialogBusy?'处理中…':dialog.kind==='rename'?'保存名称':'确认移除'}</button></div>
      </form>}
    </dialog>}
  </section>
}
