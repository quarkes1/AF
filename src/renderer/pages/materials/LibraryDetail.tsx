import {useEffect,useRef,useState} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {DocumentPreview} from './DocumentPreview'
import {formatBytes,type LibraryItem} from './model'
import {formatMusicTime} from '../../audio/home-playback'
import type {IllustrationRole} from './application-resources'
import type {SettingsPreferences} from '../settings/model'

export type PreviewAudioPreferences=Pick<SettingsPreferences,'muted'|'masterVolume'|'bgmVolume'|'attenuateOnBlur'>

export interface ResourceView{ id:string;name:string;kind:'background'|'music';builtIn:boolean;role?:IllustrationRole;item?:LibraryItem }
interface Props{entry:LibraryItem|ResourceView;resources:ResourceCatalog;url:string;active:boolean;audioPreferences:PreviewAudioPreferences;onUpdate:(patch:Partial<Pick<LibraryItem,'name'|'subject'|'textbook'|'chapter'|'position'>>)=>Promise<void>;onClose:()=>void;onRename:()=>void;onRemove:()=>void;onUse:()=>Promise<boolean>;onPreview:()=>void;onResult:(id:string,error:string|null)=>void;onAudition:(active:boolean,resume?:boolean)=>void}
export function LibraryDetail({entry,resources,url,active,audioPreferences,onUpdate,onClose,onRename,onRemove,onUse,onPreview,onResult,onAudition}:Props){
  const artRole='role'in entry?entry.role??'background':'background'
  const document=entry.kind==='document',custom='blob'in entry?entry:entry.item
  const [retry,setRetry]=useState(0),[encoding,setEncoding]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[position,setPosition]=useState(custom?.position??50)
  const [subject,setSubject]=useState(custom?.subject??''),[textbook,setTextbook]=useState(custom?.textbook??''),[chapter,setChapter]=useState(custom?.chapter??'')
  const audio=useRef<HTMLAudioElement>(null)
  useEffect(()=>{const element=audio.current;return()=>{element?.pause();onAudition(false)}},[entry.id,onAudition])
  const volumeLimit=()=>audioPreferences.masterVolume/100*audioPreferences.bgmVolume/100*(audioPreferences.attenuateOnBlur&&!window.document.hasFocus()?.25:1)
  useEffect(()=>{
    const sync=()=>{if(audio.current){audio.current.volume=volumeLimit();audio.current.muted=audioPreferences.muted}}
    sync();window.addEventListener('blur',sync);window.addEventListener('focus',sync)
    return()=>{window.removeEventListener('blur',sync);window.removeEventListener('focus',sync)}
  },[audioPreferences,entry.id])
  useEffect(()=>{setPosition(custom?.position??50)},[custom?.position])
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError(null);try{await action()}catch(reason){setError(reason instanceof Error?reason.message:'操作失败，请重试。')}finally{setBusy(false)}}
  const use=()=>run(async()=>{onAudition(false,false);audio.current?.pause();if(!await onUse())throw new Error('暂时无法应用此资源，请检查文件。')})
  return <>
    <header className="materials-detail__header"><h2>{document?'资料详情':'资源详情'}</h2><button className="quiet-button" aria-label="收起详情" data-ui-sound="back" onClick={onClose}>×</button></header>
    <div className="materials-detail__scroll">
      <h3 className="materials-detail__name" title={entry.name}>{entry.name}</h3>
      {document&&custom?<>
        <DocumentPreview item={custom} retry={retry} encoding={encoding} onResult={onResult}/>
        {['txt','md'].includes(custom.extension)&&<label className="materials-field">文本编码<select aria-label="文本编码" value={encoding} onChange={event=>setEncoding(event.target.value)}><option value="">自动检测</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030</option><option value="utf-16le">UTF-16 LE</option></select></label>}
        <div className="materials-detail__facts"><span>文件格式 <b>{custom.extension.toUpperCase()}</b></span><span>文件大小 <b>{formatBytes(custom.size)}</b></span></div>
        <form className="materials-metadata" onSubmit={event=>{event.preventDefault();void run(()=>onUpdate({subject:subject.trim(),textbook:textbook.trim(),chapter:chapter.trim()}))}}>
          <label className="materials-field">所属科目<input aria-label="所属科目" placeholder="待归类" maxLength={80} value={subject} onChange={event=>setSubject(event.target.value)}/></label>
          <label className="materials-field">教材版本<input aria-label="教材版本" placeholder="未指定" maxLength={160} value={textbook} onChange={event=>setTextbook(event.target.value)}/></label>
          <label className="materials-field">关联章节<input aria-label="关联章节" placeholder="未指定" maxLength={160} value={chapter} onChange={event=>setChapter(event.target.value)}/></label>
          <p className="materials-hint">以上为手动整理信息。教材识别、目录映射与教学解析尚未接入。</p>
          <button disabled={busy} type="submit">保存分类信息</button>
        </form>
      </>:entry.kind==='background'?<>
        <div className="materials-image-preview" data-art-role={artRole}><img src={url} alt={`${entry.name}原图预览`} style={{objectPosition:`${position}% center`}}/></div>
        <div className="materials-detail__facts"><span>资源来源 <b>{custom?'自定义':'内置'}</b></span><span>分辨率 <b>{custom?.width&&custom.height?`${custom.width} × ${custom.height}`:'随原图'}</b></span>{custom&&<span>文件格式 <b>{custom.extension.toUpperCase()}</b></span>}<span>使用位置 <b>{artRole==='portrait'?'搭档立绘':artRole==='texture'?'场景图层':'首页'}</b></span></div>
        {custom&&<label className="materials-field">画面位置<input type="range" aria-label="背景画面位置" min="0" max="100" value={position} onChange={event=>setPosition(Number(event.target.value))} onPointerUp={()=>{void run(()=>onUpdate({position}))}} onKeyUp={()=>{if(position!==custom.position)void run(()=>onUpdate({position}))}}/></label>}
        {artRole==='background'&&<div className="materials-detail__actions"><button className="materials-primary" disabled={busy||active} onClick={use}>{active?'已使用':'设为当前背景'}</button><button onClick={onPreview}>预览首页</button></div>}
      </>:<>
        <div className="materials-music-art" aria-hidden="true"><span className="icon" style={{maskImage:`url("${resources.url('icon.music')}")`,WebkitMaskImage:`url("${resources.url('icon.music')}")`}}/></div>
        <audio ref={audio} src={url} preload="metadata" controls controlsList="nodownload" onVolumeChange={()=>{const element=audio.current;if(element){if(element.volume>volumeLimit())element.volume=volumeLimit();if(audioPreferences.muted&&!element.muted)element.muted=true}}} onPlay={()=>onAudition(true)} onPause={()=>onAudition(false)} onEnded={()=>onAudition(false)} onError={()=>setError('音频暂时无法试听，请检查文件或编码。')}/>
        <div className="materials-detail__facts"><span>资源来源 <b>{custom?'自定义':'内置'}</b></span>{custom?.duration&&<span>时长 <b>{formatMusicTime(custom.duration)}</b></span>}<span>使用位置 <b>主页 BGM</b></span></div>
        <button className="materials-primary" disabled={busy||active} onClick={use}>{active?'已使用':'设为主页 BGM'}</button>
      </>}
      {error&&<p role="status" className="materials-error">{error}</p>}
      {custom&&<div className="materials-detail__footer">
        {document&&<button disabled={busy} onClick={()=>setRetry(value=>value+1)}>重新预览</button>}
        <button disabled={busy} onClick={onRename}>重命名</button>
        <button disabled={busy} onClick={()=>{audio.current?.pause();onAudition(false);onRemove()}}>{document?'移除资料':'移除资源'}</button>
        <a href={url} download={custom.filename}>下载原文件</a>
        <p className="materials-hint">文件副本保存在本机；不会修改或删除原文件。</p>
      </div>}
    </div>
  </>
}
