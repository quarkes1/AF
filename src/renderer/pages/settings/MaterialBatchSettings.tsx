import {useEffect,useState} from 'react'
import type {BackendClient} from '../materials/backend-client'

export function MaterialBatchSettings({client,open}:{client:BackendClient|null;open:boolean}){
 const [size,setSize]=useState('20'),[saved,setSaved]=useState(20),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{if(!open||!client)return;let active=true;void client.call<{classificationBatchSize:number}>('resource.settings.get').then(value=>{if(active){setSaved(value.classificationBatchSize);setSize(String(value.classificationBatchSize));setMessage('')}}).catch(error=>{if(active)setMessage(error.message)});return()=>{active=false}},[client,open])
 const value=Number(size),valid=Number.isInteger(value)&&value>=1&&value<=100
 const save=async()=>{if(!client||!valid||busy)return;setBusy(true);setMessage('');try{const result=await client.call<{classificationBatchSize:number}>('resource.settings.update',{classificationBatchSize:value});setSaved(result.classificationBatchSize);setMessage('已保存')}catch(error){setMessage(error instanceof Error?error.message:'设置未能保存。')}finally{setBusy(false)}}
 return <div><div className="settings-row"><div className="settings-row__label"><strong>每批整理资料数</strong><p>超出的资料会自动分批排队，不限制一次导入的总数量。</p></div><div className="settings-row__control"><div className="settings-inline"><input type="number" min="1" max="100" step="1" aria-label="每批整理资料数" value={size} disabled={!client||busy} onChange={event=>setSize(event.target.value)}/><button className="save-secondary" disabled={!client||!valid||busy||value===saved} onClick={()=>void save()}>保存整理设置</button></div></div></div>{!valid&&<p role="alert">请输入 1–100 之间的整数。</p>}{message&&<p role="status">{message}</p>}</div>
}
