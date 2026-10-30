import {useEffect,useState} from 'react'
import type {MaterialLibrary} from './library'
interface Source{id:string;name:string;watch:boolean;missing:boolean;lastScan:number|null}
interface Scan{files:{id:string;name:string;size:number;change:string}[];failures:{name:string;reason:string}[]}
export function SourceFolders({library}:{library:MaterialLibrary}){
 const [sources,setSources]=useState<Source[]>([]),[scan,setScan]=useState<Scan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const client=library.backend
 const load=async()=>{if(client)setSources(await client.call('resource.sources'))}
 useEffect(()=>{void load().catch(()=>{});const timer=setInterval(()=>{void load().catch(()=>{})},5000);return()=>clearInterval(timer)},[])
 if(!client)return null
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();await load();await library.refresh()}catch(error){setError(error instanceof Error?error.message:'来源操作失败。')}finally{setBusy(false)}}
 const scanSources=async(ids:string[])=>{const job=await client.call<{jobId:string}>('resource.scan',{resourceIds:ids,recursive:true});const result=await client.waitJob(job.jobId);setScan(result as Scan)}
 return <details className="materials-sources"><summary>关联文件夹与增量扫描</summary><button disabled={busy} onClick={()=>void run(async()=>{const selected=await client.call<{id:string;name:string}[]>('resource.pick',{mode:'folder'});if(selected.length)await scanSources(selected.map(s=>s.id))})}>关联资料文件夹</button>
  <p>原件只读；扫描后确认导入副本。开启自动检查后，每 15 秒检查已授权目录的新增和改版，退出 AF 后停止。</p>
  {sources.map(source=><div key={source.id}><strong>{source.name}</strong>{source.missing&&<span> · 来源失联</span>}<button disabled={busy} onClick={()=>void run(()=>scanSources([source.id]))}>重新扫描</button><label><input type="checkbox" aria-label={`自动检查 ${source.name}`} checked={source.watch} disabled={busy} onChange={e=>void run(()=>client.call('resource.watch',{sourceId:source.id,enabled:e.target.checked}))}/>自动检查</label><button disabled={busy} onClick={()=>void run(()=>client.call('resource.unlinkSource',{sourceId:source.id}))}>解除关联</button></div>)}
  {scan&&<div role="region" aria-label="文件夹扫描结果"><p>发现 {scan.files.length} 个支持的文件，新增／改版 {scan.files.filter(f=>f.change!=='unchanged').length} 个。</p><ul>{scan.files.slice(0,100).map(f=><li key={f.id}>{f.name} · {f.change==='unchanged'?'未变化':f.change==='updated'?'改版':'新增'}</li>)}</ul>{scan.failures.map((f,i)=><p key={i}>{f.name}：{f.reason}</p>)}<button disabled={busy||!scan.files.some(f=>f.change!=='unchanged')} onClick={()=>void run(async()=>{const changed=scan.files!.filter(f=>f.change!=='unchanged');for(let i=0;i<changed.length;i+=500){const job=await client.call<{jobId:string}>('resource.importGranted',{resourceIds:changed.slice(i,i+500).map(f=>f.id)});await client.waitJob(job.jobId)}setScan(null)})}>确认导入新增与改版</button><button onClick={()=>setScan(null)}>取消本次导入</button></div>}
  <p role="status">{busy?'正在处理来源…':error}</p>
 </details>
}
