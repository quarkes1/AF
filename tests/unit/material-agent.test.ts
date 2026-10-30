import {it,expect} from 'vitest'
import {runMaterialAgent} from '../../src/main/runtime/material-agent'
it('runs the dsh tool loop with a fresh task-scoped context and only permitted evidence tools',async()=>{
 const requests:any[]=[]
 const fake:typeof fetch=async(_url,options)=>{const request=JSON.parse(String(options?.body));requests.push(request);return new Response(JSON.stringify({choices:[{message:requests.length===1?{tool_calls:[{id:'read1',type:'function',function:{name:'read_document',arguments:'{"documentId":"doc1"}'}}]}:{content:'{"subject":"数学分析","evidenceBlockIds":["block1"]}'},finish_reason:requests.length===1?'tool_calls':'stop'}],usage:{total_tokens:30,prompt_tokens:20,completion_tokens:10}}))}
 const result=await runMaterialAgent({config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'local-test-only'},purpose:'resourceClassify',input:{documentIds:['doc1']},catalog:[],documents:[{id:'doc1',filename:'讲义.txt',blocks:[{id:'block1',page:1,text:'导数与极限',kind:'paragraph',quality:'native'}]}],signal:new AbortController().signal,fetcher:fake,skill:'Return JSON, use evidence.'})
 expect(result).toEqual({subject:'数学分析',evidenceBlockIds:['block1']});expect(requests).toHaveLength(2)
 expect(requests[0].tools.map((x:any)=>x.function.name).sort()).toEqual(['read_document'])
 expect(requests[1].messages.find((x:any)=>x.role==='tool')).toMatchObject({tool_call_id:'read1'})
 expect(JSON.stringify(requests)).not.toContain('characterDialogue')
})
it('gives reconciliation its own session and category tools without carrying discovery messages',async()=>{
 const requests:any[]=[]
 const fake:typeof fetch=async(_url,options)=>{requests.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({choices:[{message:{content:'{"groups":[]}'},finish_reason:'stop'}],usage:{total_tokens:10}}))}
 const base={config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'test'},catalog:[],documents:[],signal:new AbortController().signal,fetcher:fake,skill:'Return JSON.'}
 await runMaterialAgent({...base,purpose:'resourceClassify',input:{discoveryMarker:'private-first-stage'}})
 await runMaterialAgent({...base,purpose:'resourceReconcile',input:{proposals:[]}})
 expect(requests[1].tools.map((t:any)=>t.function.name).sort()).toEqual(['course_catalog','read_document'])
 expect(JSON.stringify(requests[1])).not.toContain('private-first-stage')
})
it('requests official JSON mode and makes one bounded correction for invalid model JSON',async()=>{
 const requests:any[]=[]
 const fake:typeof fetch=async(_url,options)=>{requests.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({choices:[{message:{content:requests.length===1?'{invalid json}':'{"groups":[]}'},finish_reason:'stop'}],usage:{total_tokens:10}}))}
 const result=await runMaterialAgent({config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'test'},purpose:'resourceReconcile',input:{proposals:[]},catalog:[],documents:[],signal:new AbortController().signal,fetcher:fake,skill:'Return JSON only.'})
 expect(result).toEqual({groups:[]});expect(requests).toHaveLength(2);expect(requests[0].response_format).toEqual({type:'json_object'})
 expect(JSON.stringify(requests[1].messages)).toContain('valid JSON')
})
it('keeps category tool responses within the provider budget for a large existing library',async()=>{
 const requests:any[]=[]
 const fake:typeof fetch=async(_url,options)=>{requests.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({choices:[{message:requests.length===1?{tool_calls:[{id:'catalog',type:'function',function:{name:'course_catalog',arguments:'{}'}}]}:{content:'{"groups":[]}'},finish_reason:requests.length===1?'tool_calls':'stop'}],usage:{total_tokens:20}}))}
 const catalog=Array.from({length:40},(_,i)=>({id:`c${i}`,name:`学科${i}`,aliases:[],stateVersion:0,textbook:null,examples:Array.from({length:3},()=>({documentId:`d${i}`,summary:'内容范围'.repeat(125),topics:['主题'],materialType:'课件',categoryBasis:'course'}))}))
 await runMaterialAgent({config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'test'},purpose:'resourceReconcile',input:{proposals:[]},catalog,documents:[],signal:new AbortController().signal,fetcher:fake,skill:'Return JSON only.'})
 expect(Buffer.byteLength(JSON.stringify(requests[1]))).toBeLessThan(48000)
 const result=JSON.parse(requests[1].messages.find((m:any)=>m.role==='tool').content)
 expect(result.courses.length).toBeLessThanOrEqual(5);expect(result.nextOffset).not.toBeNull()
})
