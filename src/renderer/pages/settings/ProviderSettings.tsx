import {useEffect,useState} from 'react'
import {BackendClient} from '../materials/backend-client'
const client=new BackendClient()
export function ProviderSettings(){
 const [baseUrl,setBase]=useState('https://api.deepseek.com'),[model,setModel]=useState('deepseek-flash'),[key,setKey]=useState(''),[configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{if(window.afMaterials)void client.call<{baseUrl:string;model:string;configured:boolean}>('provider.list').then(p=>{setBase(p.baseUrl);setModel(p.model);setConfigured(p.configured)}).catch(()=>setMessage('模型配置读取失败。'))},[])
 const run=async(test=false)=>{setBusy(true);setMessage('');try{if(!test){await client.call('provider.configure',{providerId:null,protocol:'openai',baseUrl,modelId:model,keyAction:'replace',apiKey:key});setKey('');setConfigured(true);setMessage('配置已安全保存。')}else{const job=await client.call<{jobId:string}>('provider.test',{providerId:null});await client.waitJob(job.jobId);setMessage('连接成功。')}}catch(error){setMessage(error instanceof Error?error.message:'连接失败。')}finally{setBusy(false)}}
 return <form className="provider-settings" onSubmit={e=>{e.preventDefault();void run()}}>
  <p>默认使用 DeepSeek。API Key 由桌面主进程加密保存，不进入资料、任务日志或导出包。</p>
  <p><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">在 DeepSeek 官方平台获取 API Key</a></p>
  <div className="settings-row"><div className="settings-row__label"><h3>自定义服务地址</h3><p>更换地址时必须重新填写该服务的 Key。</p></div><div className="settings-row__control"><input aria-label="自定义服务地址" value={baseUrl} onChange={e=>{setBase(e.target.value);setConfigured(false)}}/></div></div>
  <div className="settings-row"><div className="settings-row__label"><h3>主模型</h3></div><div className="settings-row__control"><input aria-label="主模型" value={model} onChange={e=>setModel(e.target.value)}/></div></div>
  <div className="settings-row"><div className="settings-row__label"><h3>API Key</h3><p>{configured?'已配置；不会回显密钥。':'尚未配置。'}</p></div><div className="settings-row__control"><input type="password" aria-label="API Key" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={configured?'输入新 Key 以替换':'填写 API Key'}/><button className="save-secondary" disabled={busy||key.trim().length<8||!window.afMaterials}>保存模型配置</button><button type="button" className="save-secondary" disabled={busy||!configured} onClick={()=>void run(true)}>测试连接</button></div></div>
  <p role="status">{busy?'正在连接…':message}</p>
  {configured&&<button type="button" className="save-secondary" disabled={busy} onClick={()=>{setBusy(true);void client.call('provider.configure',{providerId:null,protocol:'openai',baseUrl,modelId:model,keyAction:'clear'}).then(()=>{setConfigured(false);setKey('');setMessage('已移除保存的 Key，模型任务已停止。')}).catch(error=>setMessage(error instanceof Error?error.message:'移除失败。')).finally(()=>setBusy(false))}}>移除已保存的 API Key</button>}
 </form>
}
