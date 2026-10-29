import type {CompanionView} from './model'
import {Icon} from '../../components/Icon'
import type {ResourceCatalog} from '../../app/resources'

export function SpriteTags({value,onChange,pose,onPose,onUpload,busy,resources}:{value:CompanionView;onChange:(value:CompanionView)=>void;pose:string;onPose:(id:string)=>void;onUpload:(id:string)=>void;busy:boolean;resources:ResourceCatalog}){
  const add=()=>{
    let n=value.poses.length+1;while(value.poses.some(tag=>tag.label===`立绘 ${n}`))n++
    const id=`pose-${crypto.randomUUID()}`
    onChange({...value,poses:[...value.poses,{id,label:`立绘 ${n}`}]});onPose(id)
    requestAnimationFrame(()=>document.querySelector<HTMLInputElement>(`[data-sprite-label="${id}"]`)?.focus())
  }
  const remove=(id:string)=>{
    const poses=value.poses.filter(tag=>tag.id!==id),sprites={...value.sprites};delete sprites[id]
    const defaultPose=value.defaultPose===id?(poses.find(tag=>sprites[tag.id])??poses[0]).id:value.defaultPose
    onChange({...value,poses,sprites,defaultPose});if(pose===id)onPose(defaultPose)
  }
  return <section className="sprite-tags-editor" aria-label="立绘与标签">
    <header><h3>立绘与标签</h3><button type="button" className="save-secondary" disabled={busy} onClick={add}><Icon name="plus" resources={resources}/>添加立绘标签</button></header>
    <p>标签可自由命名、增删；默认立绘用于首页及缺图回退。删除标签会一并移除它在此模板中的图片。</p>
    <div className="sprite-tags-editor__list">{value.poses.map((tag,index)=><div className="sprite-tags-editor__row" key={tag.id} data-preview={pose===tag.id}>
      <button type="button" className="sprite-tag-preview" aria-label={`预览 ${tag.label}`} aria-pressed={pose===tag.id} onClick={()=>onPose(tag.id)}><Icon name="image" resources={resources}/></button>
      <label className="sprite-tag-name"><span className="sr-only">立绘标签名称 {index+1}</span><input data-sprite-label={tag.id} maxLength={64} value={tag.label} disabled={busy} onChange={event=>onChange({...value,poses:value.poses.map(item=>item.id===tag.id?{...item,label:event.target.value}:item)})}/></label>
      <label className="sprite-tag-default"><input type="radio" name="default-pose" aria-label={`默认立绘 ${tag.label}`} checked={value.defaultPose===tag.id} disabled={busy} onChange={()=>onChange({...value,defaultPose:tag.id})}/>默认</label>
      <button type="button" className="save-secondary" disabled={busy} aria-label={`上传立绘 ${tag.label}`} onClick={()=>onUpload(tag.id)}>{value.sprites[tag.id]?'更换图片':'上传图片'}</button>
      <button type="button" className="quiet-button" aria-label={`删除立绘标签 ${tag.label}`} disabled={busy||value.poses.length===1} onClick={()=>remove(tag.id)}><Icon name="trash" resources={resources}/></button>
    </div>)}</div>
  </section>
}
