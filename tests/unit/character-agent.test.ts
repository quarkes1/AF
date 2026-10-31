import {it,expect} from 'vitest'
import {runCharacterAgent} from '../../src/main/runtime/character-agent'
import {contentHash} from '../../src/main/infrastructure/digest'
it('runs a fresh dsh character session with only scoped character and presented-history tools',async()=>{
 const requests:any[]=[]
 const fetcher:typeof fetch=async(_url,options)=>{requests.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({choices:[{message:requests.length===1?{tool_calls:[{id:'profile',type:'function',function:{name:'get_character_profile',arguments:'{}'}}]}:{content:'{"segments":[{"kind":"dialogue","text":"我们一起看看。","poseTag":"neutral"}]}'},finish_reason:requests.length===1?'tool_calls':'stop'}],usage:{total_tokens:30,prompt_tokens:20,completion_tokens:10}}))}
 const base:any={bundleId:'bundle',purpose:'characterDialogue',saveId:'save-a',branchId:'branch-a',actorId:'af-guide',contextRevision:1,visibleEventCutoff:1,sourceEventIds:['user1'],characterCoreVersion:1,growthVersion:0,memoryProjectionVersion:1,suppressionVersion:0,documentVersionIds:[],allowedArtifactIds:[],currentInputEventId:'user1',summaryRefs:[],profile:{name:'Aurore',personality:'好奇，温和',poses:[{id:'neutral',label:'日常'}],defaultPose:'neutral'},user:{displayName:'我',preferredAddress:'',timezone:'Asia/Shanghai',textScale:1,reducedMotion:false,stateVersion:0},history:[],recallHistory:[],currentInput:{id:'user1',seq:1,role:'user',name:'我',text:'你好',createdAt:'now',sourceEventIds:['user1']},systemTime:'2026-10-30'}
 const result=await runCharacterAgent({config:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'unit-character-credential'},scope:{saveId:'save-a',branchId:'branch-a',sessionId:'session-a',jobId:'job',taskId:'task',taskRevision:1,runtimeEpoch:'epoch',purpose:'characterDialogue'},bundle:{...base,contentHash:contentHash(base)},skill:'Only use allowed evidence. Return JSON.',signal:new AbortController().signal,fetcher})
 expect(result.reply.segments[0].text).toBe('我们一起看看。')
 expect(requests[0].tools.map((t:any)=>t.function.name).sort()).toEqual(['get_character_profile','recall_shared_history'])
 expect(JSON.stringify(requests)).not.toMatch(/course_catalog|read_document|resource-ingest|unit-character-credential/)
 expect(result.usage.calls).toBe(2)
})
