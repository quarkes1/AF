import {useCallback,useEffect,useRef,useState} from 'react'
import type {ChatScope,HomeAnchor,HomePage,HomeState,PresentationReceiptInput} from '../../../shared/contracts/home-chat'
import {StoryClient,StoryClientError} from '../saves/backend-client'

const keyOf=(scope:ChatScope)=>`${scope.saveId}:${scope.branchId}`
type Pending={receipt:PresentationReceiptInput;index:number}
export function useHomeConversation({client,scope,visible,onAccepted,onRestoreDraft,onRegisterFlush,onStoryTouched}:{client:StoryClient|null;scope:ChatScope|null;visible:boolean;onAccepted:(scope:ChatScope,text:string)=>void;onRestoreDraft:(scope:ChatScope,text:string)=>void;onRegisterFlush?:(flush:()=>Promise<void>)=>void;onStoryTouched?:()=>void}){
 const key=scope?keyOf(scope):''
 const [states,setStates]=useState<Record<string,HomeState>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[submitting,setSubmitting]=useState(false)
 const stateRef=useRef(states),latest=useRef({client,scope,visible,onAccepted,onRestoreDraft,onStoryTouched});stateRef.current=states;latest.current={client,scope,visible,onAccepted,onRestoreDraft,onStoryTouched}
 const generations=useRef(new Map<string,number>()),pending=useRef(new Map<string,Map<string,Pending>>()),displayed=useRef(new Map<string,Map<string,Pending>>()),failedRestored=useRef(new Set<string>()),intents=useRef(new Map<string,{text:string;key:string}>()),mutating=useRef(false)
 const chain=useRef<Promise<void>>(Promise.resolve()),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const refresh=useCallback(async(target:ChatScope)=>{
  const api=latest.current.client;if(!api)return
  const targetKey=keyOf(target),generation=generations.current.get(targetKey)??0
  const next=await api.call<HomeState>('home.get',{},target)
  if(!alive.current||generation!==(generations.current.get(targetKey)??0))return
  const prior=stateRef.current[targetKey]
  if(prior&&(next.contextRevision<prior.contextRevision||next.stateVersion<prior.stateVersion||next.job?.jobId===prior.job?.jobId&&(next.job?.stateVersion??0)<(prior.job?.stateVersion??0)))return
  stateRef.current={...stateRef.current,[targetKey]:next};setStates(stateRef.current)
  if(!next.reply||next.reply.stopped)displayed.current.delete(targetKey)
  if(next.providerConfigured)setErrors(old=>old[targetKey]?.includes('请先在设置中配置模型')?{...old,[targetKey]:''}:old)
  if(next.job&&['failed','cancelled'].includes(next.job.status)&&next.acceptedText&&!failedRestored.current.has(next.job.jobId)){failedRestored.current.add(next.job.jobId);latest.current.onRestoreDraft(target,next.acceptedText)}
 },[])
 const flush=useCallback(async(target?:ChatScope)=>{
  const selected=target??latest.current.scope,api=latest.current.client;if(!selected||!api)return
  const targetKey=keyOf(selected)
  const work=chain.current.catch(()=>{}).then(async()=>{
   const entries=pending.current.get(targetKey);if(!entries)return
   while(entries.size){
    const entry=[...entries.values()].sort((a,b)=>a.index-b.index)[0],receipt=entry.receipt
    try{await api.call('story.present',{receipt},selected,receipt.receiptId)}catch(error){if(error instanceof StoryClientError&&error.code==='STALE_STATE'){await api.call('save.get',{saveId:selected.saveId});await api.call('story.present',{receipt},selected,receipt.receiptId)}else throw error}
    if(entries.get(receipt.pageId)?.receipt.receiptId===receipt.receiptId)entries.delete(receipt.pageId)
   }
  })
  chain.current=work
  await work
 },[])
 useEffect(()=>{onRegisterFlush?.(()=>flush());return()=>onRegisterFlush?.(async()=>{})},[onRegisterFlush,flush])
 useEffect(()=>{
  if(!client||!scope)return
  const target={...scope};let stopped=false,timer:ReturnType<typeof setTimeout>|undefined
  if(!visible){void flush(target).then(()=>latest.current.onStoryTouched?.()).catch(error=>{if(alive.current)setErrors(old=>({...old,[keyOf(target)]:error instanceof Error?error.message:'呈现记录暂未保存。'}))});return}
  const poll=async()=>{try{await refresh(target)}catch(error){if(!stopped)setErrors(old=>({...old,[keyOf(target)]:error instanceof Error?error.message:'无法读取聊天状态。'}))}finally{if(!stopped)timer=setTimeout(()=>void poll(),350)}}
  void poll();return()=>{stopped=true;clearTimeout(timer);void flush(target).catch(()=>{})}
 },[client,key,visible,flush,refresh])
 const anchor=useCallback((target:ChatScope):HomeAnchor|null=>{
  const entry=[...(displayed.current.get(keyOf(target))?.values()??[])].filter(e=>e.receipt.revealedGraphemeCount>0).sort((a,b)=>b.index-a.index)[0]
  const current=stateRef.current[keyOf(target)]?.reply
  if(!current||current.stopped||!current.pages.some(p=>p.pageId===entry?.receipt.pageId))return null
  if(!entry)return null
  const {receiptId:_,channel:__,...value}=entry.receipt;return value
 },[])
 const mutate=useCallback(async(action:'send'|'retry'|'stop',text='')=>{
  const {client:api,scope:target}=latest.current;if(!api||!target||mutating.current)return false
  const targetKey=keyOf(target);mutating.current=true;setSubmitting(true);setErrors(old=>({...old,[targetKey]:''}))
  try{
   await flush(target)
   generations.current.set(targetKey,(generations.current.get(targetKey)??0)+1)
   await refresh(target)
   const before=stateRef.current[targetKey]
   if(action==='stop'){
    await api.call('home.stop',{anchor:anchor(target)},target)
   }else if(action==='retry'){
    if(!before?.job)throw new Error('没有可重试的消息。')
    await api.call('jobs.retry',{jobId:before.job.jobId},target)
    latest.current.onAccepted(target,before.acceptedText??text)
   }else{
    let intent=intents.current.get(targetKey);if(!intent||intent.text!==text){intent={text,key:crypto.randomUUID()};intents.current.set(targetKey,intent)}
    await api.call('story.send',{channel:'home',text,anchor:anchor(target)},target,intent.key)
    intents.current.delete(targetKey);latest.current.onAccepted(target,text)
   }
   displayed.current.delete(targetKey)
   await refresh(target);latest.current.onStoryTouched?.();return true
  }catch(error){if(alive.current)setErrors(old=>({...old,[targetKey]:error instanceof Error?error.message:'请求失败，草稿已保留。'}));return false}
  finally{mutating.current=false;if(alive.current)setSubmitting(false)}
 },[anchor,flush,refresh])
 const markPresented=useCallback((page:HomePage,count:number)=>{
  const {scope:target,visible:isVisible}=latest.current;if(!target||!isVisible||count<=0||count>page.graphemeCount)return
  const targetKey=keyOf(target),current=stateRef.current[targetKey]
  if(current?.reply?.replyId!==page.replyId||current.reply.stopped)return
  const shown=displayed.current.get(targetKey)??new Map<string,Pending>();displayed.current.set(targetKey,shown)
  if((shown.get(page.pageId)?.receipt.revealedGraphemeCount??0)>=count)return
  const receipt:PresentationReceiptInput={receiptId:crypto.randomUUID(),actId:page.actId,nodeId:page.nodeId,pageId:page.pageId,scriptRevision:page.scriptRevision,paginationVersion:page.paginationVersion,revealedGraphemeCount:count,channel:'home'},entry={receipt,index:page.index};shown.set(page.pageId,entry)
  if(count>page.revealedGraphemeCount){const entries=pending.current.get(targetKey)??new Map<string,Pending>();pending.current.set(targetKey,entries);entries.set(page.pageId,entry);void flush(target).then(()=>{if(count===page.graphemeCount&&current.reply?.pages.at(-1)?.pageId===page.pageId)latest.current.onStoryTouched?.()}).catch(error=>{if(alive.current)setErrors(old=>({...old,[targetKey]:error instanceof Error?error.message:'呈现记录暂未保存。'}))})}
 },[flush])
 return{state:states[key]??null,error:errors[key]??'',submitting,markPresented,send:(text:string)=>mutate('send',text),retry:()=>mutate('retry'),stop:()=>mutate('stop'),flush}
}
