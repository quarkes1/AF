import {useEffect,useRef,useState} from 'react'
import type {CompanionView} from '../companions/model'
import type {StoryRecord} from '../../../shared/contracts/story'
export type NewStoryValues=Pick<StoryRecord,'name'|'worldSetting'|'partnerIdentity'|'userIdentity'|'relationshipStart'|'courseIds'>&{characterTemplateId:string;characterTemplateVersion:number}
export function CreateStoryDialog({companions,selectedId,onCreate,onClose}:{companions:CompanionView[];selectedId:string;onCreate:(values:NewStoryValues)=>Promise<void>;onClose:()=>void}){
 const available=companions.filter(c=>!c.draft),initial=available.find(c=>c.id===selectedId)??available[0]
 const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false)
 const [templateId,setTemplateId]=useState(initial?.id??''),[name,setName]=useState('全新的起点'),[mode,setMode]=useState<'realWorld'|'custom'>('realWorld'),[background,setBackground]=useState(initial?.background||'现实校园'),[partner,setPartner]=useState(initial?.partnerIdentity||'伙伴'),[user,setUser]=useState(initial?.userIdentity||'用户'),[relationship,setRelationship]=useState(initial?.relationship||'刚认识不久'),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
 const submit=async()=>{if(saving.current)return;const template=available.find(c=>c.id===templateId);if(!template){setError('请先完成并保存一个搭档。');return}if(!name.trim()||!background.trim()||!partner.trim()||!user.trim()||!relationship.trim()){setError('请填写故事名称、背景、双方身份与关系起点。');return}saving.current=true;setBusy(true);setError('');try{await onCreate({name,characterTemplateId:template.id,characterTemplateVersion:template.templateVersion??1,worldSetting:{mode,description:background},partnerIdentity:partner,userIdentity:user,relationshipStart:relationship,courseIds:[]})}catch(reason){setError(reason instanceof Error?reason.message:'创建失败，已有故事未改变。')}finally{saving.current=false;setBusy(false)}}
 return <dialog ref={dialog} className="save-dialog save-dialog--create" aria-labelledby="create-story-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}><form onSubmit={e=>{e.preventDefault();void submit()}}>
  <h2 id="create-story-title">新建故事</h2><p>保存当前搭档设定的独立快照，之后编辑模板不会改变这个故事。</p>
  <label>故事名称<input autoFocus value={name} maxLength={256} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
  <label>主要搭档<select value={templateId} disabled={busy} onChange={e=>{setTemplateId(e.target.value);const t=available.find(c=>c.id===e.target.value);if(t){setBackground(t.background||'现实校园');setPartner(t.partnerIdentity||'伙伴');setUser(t.userIdentity||'用户');setRelationship(t.relationship||'刚认识不久')}}}>{available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label>世界设定<select disabled={busy} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="realWorld">现实世界</option><option value="custom">自定义世界</option></select></label>
  <label>故事背景<textarea value={background} maxLength={8000} disabled={busy} onChange={e=>setBackground(e.target.value)}/></label>
  <label>搭档身份<input value={partner} maxLength={2000} disabled={busy} onChange={e=>setPartner(e.target.value)}/></label>
  <label>用户身份<input value={user} maxLength={2000} disabled={busy} onChange={e=>setUser(e.target.value)}/></label>
  <label>关系起点<input value={relationship} maxLength={2000} disabled={busy} onChange={e=>setRelationship(e.target.value)}/></label>
  <small>身份不会替换你的全局姓名；主线剧本尚未生成。</small>{error&&<p role="alert">{error}</p>}<div><button type="button" className="save-secondary" disabled={busy} onClick={onClose}>取消</button><button className="save-primary" disabled={busy||!available.length}>{busy?'正在创建':'创建故事'}</button></div>
 </form></dialog>
}
