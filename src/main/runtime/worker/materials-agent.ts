import {runMaterialAgent,type MaterialAgentInput} from '../material-agent'
process.on('message',(input:Omit<MaterialAgentInput,'signal'|'fetcher'>)=>{const abort=new AbortController();void runMaterialAgent({...input,signal:abort.signal}).then(result=>process.send?.({ok:true,result}),error=>process.send?.({ok:false,error:error instanceof Error?error.message:'模型执行失败。'}))})
