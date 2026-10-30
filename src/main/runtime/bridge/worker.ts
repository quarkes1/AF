import {fork} from 'node:child_process'
import {resolve} from 'node:path'
export async function runWorker<T>(entry:string,input:unknown,signal:AbortSignal,timeoutMs=120000):Promise<T>{
 signal.throwIfAborted()
 return new Promise((accept,reject)=>{
  const worker=fork(entry,[],{execPath:process.execPath,execArgv:[],env:{ELECTRON_RUN_AS_NODE:'1',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP},stdio:['ignore','ignore','ignore','ipc'],serialization:'json',windowsHide:true})
  let settled=false
  const finish=(value?:T,error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);if(worker.pid&&process.platform==='win32'){const killer=forkKill(worker.pid);killer?.unref()}else worker.kill();error?reject(error):accept(value!)}
  const cancel=()=>finish(undefined,new Error('CANCELLED'));signal.addEventListener('abort',cancel,{once:true})
  const timer=setTimeout(()=>finish(undefined,new Error('任务长时间未完成，请重试或检查文档。')),timeoutMs)
  worker.on('error',()=>finish(undefined,new Error('AF 工作器无法启动。')))
  worker.on('exit',()=>finish(undefined,new Error('AF 工作器意外退出。')))
  worker.on('message',(message:any)=>message.ok?finish(message.result):finish(undefined,new Error(message.error??'后台任务失败。')))
  worker.send(input as Parameters<typeof worker.send>[0])
 })
}
import {spawn} from 'node:child_process'
function forkKill(pid:number){return spawn('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}
