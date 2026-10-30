import {safeStorage} from 'electron'
import {readFileSync,existsSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {randomBytes,createHmac} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import type {ProviderConfig} from './deepseek'
export class ProviderProfile{
 constructor(private root:string,private db:DatabaseSync){
  const legacy=join(root,'data','provider.json')
  if(!this.row('provider')&&existsSync(legacy)&&safeStorage.isEncryptionAvailable()){
   const old=JSON.parse(readFileSync(legacy,'utf8'))
   this.save(old.baseUrl,old.model,safeStorage.decryptString(Buffer.from(old.encryptedKey,'base64')))
   unlinkSync(legacy)
  }
 }
 private row(key:string){return (this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as {value:string}|undefined)?.value}
 private put(key:string,value:string){this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value)}
 summary(){try{const c=this.get();return{configured:true,baseUrl:c.baseUrl,model:c.model}}catch{return{configured:false,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'}}}
 get():ProviderConfig{const value=this.row('provider');if(!value)throw new Error('请先配置模型 API Key。');if(!safeStorage.isEncryptionAvailable())throw new Error('系统凭据保护不可用，无法读取 API Key。');return JSON.parse(safeStorage.decryptString(Buffer.from(value,'base64'))) as ProviderConfig}
 clear(){this.db.prepare("DELETE FROM meta WHERE key='provider'").run()}
 save(baseUrl:string,model:string,key:string){
  const url=new URL(baseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('模型地址必须为不含凭据的 HTTPS 地址。')
  if(!safeStorage.isEncryptionAvailable())throw new Error('系统凭据保护不可用；API Key 未保存。')
  this.put('provider',safeStorage.encryptString(JSON.stringify({baseUrl:baseUrl.replace(/\/$/,''),model,apiKey:key})).toString('base64'))
 }
 intentHash(value:string){
  if(!safeStorage.isEncryptionAvailable())throw new Error('系统凭据保护不可用，不能接受含凭据的任务。')
  let encrypted=this.row('intent_hash_key')
  if(!encrypted){encrypted=safeStorage.encryptString(randomBytes(32).toString('hex')).toString('base64');this.put('intent_hash_key',encrypted)}
  return createHmac('sha256',Buffer.from(safeStorage.decryptString(Buffer.from(encrypted,'base64')),'hex')).update(value).digest('hex')
 }
 async test(signal?:AbortSignal){const c=this.get();const response=await fetch(c.baseUrl+'/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(30000),...signal?[signal]:[]]),headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,messages:[{role:'user',content:'Reply OK.'}],max_tokens:8,...new URL(c.baseUrl).hostname==='api.deepseek.com'?{thinking:{type:'disabled'}}:{}})});if(!response.ok)throw new Error(response.status===401?'API Key 无效，请重新检查。':response.status===429?'服务商限流或配额不足，请稍后重试。':`模型连接失败（HTTP ${response.status}）。`);return{connected:true}}
}
