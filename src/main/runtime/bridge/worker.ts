import {fork} from 'node:child_process'
import {resolve} from 'node:path'
export async function runWorker<T>(entry:string,input:unknown,signal:AbortSignal,timeoutMs=120000,onProgress?:(value:{calls:number;tokens:number;reason?:string})=>void,onTool?:(payload:unknown)=>Promise<unknown>):Promise<T>{
 signal.throwIfAborted()
 return new Promise((accept,reject)=>{
  const worker=fork(entry,[],{execPath:process.execPath,execArgv:[],env:{ELECTRON_RUN_AS_NODE:'1',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP},stdio:['ignore','ignore','ignore','ipc'],serialization:'json',windowsHide:true})
  let settled=false
  const finish=(value?:T,error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);if(worker.pid&&process.platform==='win32'){const killer=forkKill(worker.pid);killer?.unref()}else worker.kill();error?reject(error):accept(value!)}
  const cancel=()=>finish(undefined,new Error('CANCELLED'));signal.addEventListener('abort',cancel,{once:true})
  const timer=setTimeout(()=>finish(undefined,new Error('任务长时间未完成，请重试或检查文档。')),timeoutMs)
  worker.on('error',()=>finish(undefined,new Error('AF 工作器无法启动。')))
  worker.on('exit',()=>finish(undefined,new Error('AF 工作器意外退出。')))
  worker.on('message',(message:any)=>{if(message.progress){const p=message.progress;if(Number.isSafeInteger(p.calls)&&p.calls>=0&&p.calls<=100&&Number.isFinite(p.tokens)&&p.tokens>=0&&p.tokens<=10000000)onProgress?.({calls:p.calls,tokens:p.tokens,...['calls','tokens','context'].includes(p.reason)?{reason:p.reason}:{}});return}if(message.toolRequest){const request=message.toolRequest;if(settled||!onTool||request.name!=='layout_preview'||typeof request.id!=='string'||request.id.length>160)return;void Promise.resolve().then(()=>onTool(request.payload)).then(result=>{if(!settled&&worker.connected)worker.send({toolResult:{id:request.id,ok:true,result}},()=>{})},()=>{if(!settled&&worker.connected)worker.send({toolResult:{id:request.id,ok:false,error:'LAYOUT_VALIDATION_FAILED'}},()=>{})});return}message.ok?finish(message.result):finish(undefined,new Error(message.error??'后台任务失败。'))})
  worker.send(input as Parameters<typeof worker.send>[0])
 })
}
import {spawn} from 'node:child_process'
function forkKill(pid:number){return spawn('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}
