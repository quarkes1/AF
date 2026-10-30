import {LlmAdapter,ToolCallId,type GenerateOptions,type StreamChunk} from '@deepseek-ai/dsh-llm'
export interface ProviderConfig{baseUrl:string;model:string;apiKey:string}
export class DeepSeekAdapter extends LlmAdapter{
  constructor(private config:ProviderConfig,private budget:{calls:number;tokens:number},private fetcher:typeof fetch=fetch){super()}
  async resolveModel(provider:string,model:string){return{provider,id:model,name:model,defaultMaxTokens:4096}}
  async *stream(options:GenerateOptions):AsyncIterable<StreamChunk>{
    if(++this.budget.calls>8||this.budget.tokens>24000)throw new Error('BUDGET_EXCEEDED')
    const messages:unknown[]=[]
    for(const message of options.messages){
      const m=message as unknown as {role:string;toolCallId?:string;content:{type:string;text?:string;id?:string;name?:string;arguments?:string;toolCallId?:string;callId?:string;content?:unknown}[]}
      const texts=m.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')
      if(m.role==='tool')messages.push({role:'tool',tool_call_id:m.toolCallId,content:texts||JSON.stringify(m.content)})
      else{const calls=m.content.filter(b=>b.type==='tool-call').map(b=>({id:b.id,type:'function',function:{name:b.name,arguments:b.arguments}}));messages.push({role:m.role==='developer'?'system':m.role,content:texts||null,...calls.length?{tool_calls:calls}:{}})}
    }
    const tools=(options.tools??[]).map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}))
    if(Buffer.byteLength(JSON.stringify(messages))+Buffer.byteLength(JSON.stringify(tools))>48000)throw new Error('BUDGET_EXCEEDED')
    const response=await this.fetcher(this.config.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},signal:options.signal,body:JSON.stringify({model:this.config.model,messages,tools:tools.length?tools:undefined,stream:false,max_tokens:4096,...new URL(this.config.baseUrl).hostname==='api.deepseek.com'?{thinking:{type:'disabled'},response_format:{type:'json_object'}}:{}})})
    if(!response.ok)throw new Error(response.status===401?'AUTHENTICATION_FAILED':response.status===429?'RATE_LIMITED':`PROVIDER_HTTP_${response.status}`)
    const data=await response.json() as {choices?:{message:{content?:string;tool_calls?:{id:string;function:{name:string;arguments:string}}[]};finish_reason:string}[];usage?:{total_tokens:number;prompt_tokens:number;completion_tokens:number}}
    const choice=data.choices?.[0];if(!choice)throw new Error('INVALID_PROVIDER_RESPONSE')
    let index=0
    if(choice.message.content){const text=choice.message.content;yield{type:'block-start',index,blockType:'text'};yield{type:'text-delta',index,text};yield{type:'block-end',index,block:{type:'text',text}};index++}
    for(const call of choice.message.tool_calls??[]){const id=ToolCallId(call.id);yield{type:'block-start',index,blockType:'tool-call'};yield{type:'tool-call-delta',index,id,name:call.function.name,argumentsDelta:call.function.arguments};yield{type:'block-end',index,block:{type:'tool-call',id,name:call.function.name,arguments:call.function.arguments}};index++}
    this.budget.tokens+=data.usage?.total_tokens??4096
    yield{type:'usage',usage:{inputTokens:data.usage?.prompt_tokens??0,outputTokens:data.usage?.completion_tokens??0}}
    yield{type:'finish',reason:{kind:choice.finish_reason==='tool_calls'?'tool-calls':choice.finish_reason==='length'?'max-tokens':'stop'}}
  }
}
