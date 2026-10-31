import {runExperienceAgent} from '../experience-agent'
import {randomUUID} from 'node:crypto'
const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
process.on('message',(message:any)=>{const result=message?.toolResult;if(!result)return;const item=pending.get(result.id);if(!item)return;pending.delete(result.id);result.ok?item.resolve(result.result):item.reject(new Error('LAYOUT_VALIDATION_FAILED'))})

process.once('message',async(input:Parameters<typeof runExperienceAgent>[0])=>{try{const result=await runExperienceAgent({...input,signal:new AbortController().signal,onProgress:value=>process.send?.({progress:value}),preview:request=>new Promise((resolve,reject)=>{const id=randomUUID();pending.set(id,{resolve,reject});process.send?.({toolRequest:{id,name:'layout_preview',payload:request}});const timer=setTimeout(()=>{if(pending.delete(id))reject(new Error('LAYOUT_TIMEOUT'))},15000);timer.unref()})});process.send?.({ok:true,result})}catch(error){const raw=error instanceof Error?error.message:'';process.send?.({ok:false,error:['AUTHENTICATION_FAILED','BUDGET_EXCEEDED','INVALID_MODEL_OUTPUT','CONTEXT_STALE'].includes(raw)?raw:'RUNTIME_UNAVAILABLE'})}})
