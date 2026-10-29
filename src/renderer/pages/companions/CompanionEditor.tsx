import {useEffect,useRef,useState} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {CompanionPortrait} from './CompanionPortrait'
import {encodeCompanion,MAX_COMPANION_BYTES,type CompanionView,type PoseId} from './model'
import {SpriteTags} from './SpriteTags'

export function CompanionEditor({value,onChange,onSave,onCancel,resources,error,onBusyChange}:{value:CompanionView;onChange:(value:CompanionView)=>void;onSave:(draft:boolean)=>void;onCancel:()=>void;resources:ResourceCatalog;error:string|null;onBusyChange:(busy:boolean)=>void}){
  const file=useRef<HTMLInputElement>(null),composing=useRef(false)
  const latest=useRef(value),active=useRef(true),uploadId=useRef(0)
  latest.current=value
  useEffect(()=>{active.current=true;return()=>{active.current=false;uploadId.current++}},[])
  const [pose,setPose]=useState<PoseId>(value.defaultPose),[fileError,setFileError]=useState<string|null>(null)
  const [uploading,setUploading]=useState(false)
  useEffect(()=>{onBusyChange(uploading);return()=>onBusyChange(false)},[uploading,onBusyChange])
  const patch=(data:Partial<CompanionView>)=>onChange({...value,...data})
  const upload=async(image:File)=>{
    const request=++uploadId.current,target=pose
    setUploading(true)
    setFileError(null)
    try{
      if(image.size>5*1024*1024)throw new Error('请选择不超过 5MB 的 PNG 立绘。')
      const bytes=new Uint8Array(await image.slice(0,8).arrayBuffer())
      if(bytes.length!==8||[137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n))throw new Error('请选择有效的 PNG 立绘，建议使用透明背景全身图。')
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('无法读取立绘。'));reader.readAsDataURL(image)})
      const decoded=new Image();decoded.src=data;await decoded.decode()
      const next={...latest.current,sprites:{...latest.current.sprites,[target]:data}}
      if(new TextEncoder().encode(encodeCompanion(next)).length>MAX_COMPANION_BYTES)throw new Error('全部立绘与设定合计不能超过 64MB，请压缩图片后重试。')
      if(active.current&&request===uploadId.current&&latest.current.poses.some(tag=>tag.id===target))onChange(next)
    }catch(reason){if(active.current&&request===uploadId.current)setFileError(reason instanceof Error?reason.message:'立绘读取失败。')}
    finally{if(active.current&&request===uploadId.current)setUploading(false)}
  }
  return <div className="companion-editor">
    <aside className="companion-editor__preview"><CompanionPortrait image={value.sprites[pose]??value.sprites[value.defaultPose]} name={value.name} resources={resources}/><div><p>立绘预览</p><button className="save-secondary" type="button" onClick={()=>file.current?.click()}><Icon name="image" resources={resources}/>更换{value.poses.find(tag=>tag.id===pose)?.label}立绘</button><input ref={file} type="file" accept="image/png,.png" aria-label="选择 PNG 立绘" onChange={event=>{const image=event.target.files?.[0];event.target.value='';if(image)void upload(image)}} hidden/>{fileError&&<p role="alert">{fileError}</p>}</div></aside>
    <form className="companion-editor__panel" onSubmit={event=>{event.preventDefault();if(!composing.current&&!uploading)onSave(false)}} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={event=>{if(event.key==='Enter'&&(event.nativeEvent.isComposing||composing.current||event.keyCode===229))event.preventDefault()}}>
      <h2><Icon name="folder" resources={resources}/>搭档模板{value.name.includes('副本')?' · 副本':''}</h2>
      <div className="companion-editor__fields">
        <div className="companion-form-row"><label>搭档姓名<input name="companion-name" value={value.name} onChange={event=>patch({name:event.target.value})}/></label><label>来源类型<select value={value.sourceKind} onChange={event=>patch({sourceKind:event.target.value as CompanionView['sourceKind']})}><option value="original">原创 / 自设</option><option value="existing">已有作品角色</option></select></label></div>
        {value.sourceKind==='existing'&&<label>所属作品<input value={value.sourceWork} onChange={event=>patch({sourceWork:event.target.value})}/></label>}
        <div className="companion-form-row"><label>搭档身份<input value={value.partnerIdentity} onChange={event=>patch({partnerIdentity:event.target.value})}/></label><label>用户身份<input value={value.userIdentity} onChange={event=>patch({userIdentity:event.target.value})}/></label></div>
        <label>人物设定{value.examples&&<small>设定示例</small>}<textarea value={value.personality} onChange={event=>patch({personality:event.target.value,examples:false})} rows={3}/></label>
        <div className="companion-form-row"><label>现实背景<input value={value.background} onChange={event=>patch({background:event.target.value})}/></label><label>对用户的称呼<input value={value.address} placeholder="未指定时使用自然称呼" onChange={event=>patch({address:event.target.value})}/></label></div>
        <details className="companion-advanced"><summary>高级设定 <span>语言习惯、知识范围、关系起点与主动性</span></summary><div className="companion-advanced__fields">
          {([['speech','语言习惯'],['knowledge','知识范围'],['relationship','关系起点'],['initiative','主动性'],['immutable','不可随意变更的特征'],['events','原作事件继承']] as const).map(([key,label])=><label key={key}>{label}<textarea rows={2} value={value[key]} onChange={event=>patch({[key]:event.target.value})}/></label>)}

        </div></details>
        <SpriteTags value={value} onChange={onChange} pose={pose} onPose={setPose} onUpload={id=>{setPose(id);file.current?.click()}} busy={uploading} resources={resources}/>
        <div className="companion-sprite-status"><span>{uploading?'正在读取立绘…':'默认立绘'}</span><Icon name={value.sprites[value.defaultPose]?'check-circle':'image'} resources={resources}/><span>{value.sprites[value.defaultPose]?'已添加':'尚未添加，可先保存草稿'}</span></div>
        {error&&<p className="companion-error" role="alert">{error}</p>}
      </div>
      <footer><p>只修改此模板，已有故事不受影响。<small>本次前端预览暂存，可导出预览包保留。</small></p><div><button type="button" className="save-secondary" data-ui-sound="back" onClick={onCancel}>取消</button><button type="button" disabled={uploading} className="save-secondary" data-ui-sound="confirm" onClick={()=>onSave(true)}>保存草稿</button><button type="submit" disabled={uploading} className="save-primary" data-ui-sound="confirm">保存搭档</button></div></footer>
    </form>
  </div>
}
