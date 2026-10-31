import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'
import type {StoryClient} from '../saves/backend-client'
import {useHomeConversation} from './useHomeConversation'
import {HomeReply} from './HomeReply'

/** No-save composer: drafts are local to this mounted home, never a fabricated conversation. */
export function HomeChat({open,focusRequest,partnerId,partnerName,resources,onClose,onCreateStory,activeStoryId=null,activeBranchId=null,client=null,typewriter=true,charsPerSecond=4,onRegisterFlush,onStoryTouched,onOpenSettings,onPose}:{
  open:boolean;focusRequest:number;partnerId:string;partnerName:string;resources:ResourceCatalog;onClose:()=>void;onCreateStory:()=>void;activeStoryId?:string|null;activeBranchId?:string|null;client?:StoryClient|null;typewriter?:boolean;charsPerSecond?:number;onRegisterFlush?:(flush:()=>Promise<void>)=>void;onStoryTouched?:()=>void;onOpenSettings?:()=>void;onPose?:(tag:string|null)=>void
}) {
  const input=useRef<HTMLTextAreaElement>(null)
  const composing=useRef(false)
  const [drafts,setDrafts]=useState<Record<string,string>>({})
  const draftKey=activeStoryId?`save:${activeStoryId}:${activeBranchId??'main'}`:`template:${partnerId}`
  const draft=drafts[draftKey]??''
  const setDraft=(value:string)=>setDrafts(old=>({...old,[draftKey]:value}))
  const [needsStory,setNeedsStory]=useState(false)
  const [documentVisible,setDocumentVisible]=useState(()=>document.visibilityState!=='hidden')
  const panel=useRef<HTMLElement>(null),[panelReady,setPanelReady]=useState(false)
  useEffect(()=>{
    setPanelReady(false);if(!open||!panel.current)return
    const style=getComputedStyle(panel.current),milliseconds=(value:string)=>value.split(',').map(s=>s.trim().endsWith('ms')?parseFloat(s):parseFloat(s)*1000)
    const duration=Math.max(0,...milliseconds(style.transitionDuration))+Math.max(0,...milliseconds(style.transitionDelay))
    const timer=setTimeout(()=>setPanelReady(true),duration+34);return()=>clearTimeout(timer)
  },[open])
  useEffect(()=>{const changed=()=>setDocumentVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed)},[])
  const native=!!client&&!!activeStoryId&&!!activeBranchId
  const conversation=useHomeConversation({client,scope:native?{saveId:activeStoryId!,branchId:activeBranchId!}:null,visible:open&&documentVisible&&panelReady,onAccepted:(scope,text)=>setDrafts(old=>{const key=`save:${scope.saveId}:${scope.branchId}`;return old[key]===text?{...old,[key]:''}:old}),onRestoreDraft:(scope,text)=>setDrafts(old=>{const key=`save:${scope.saveId}:${scope.branchId}`;return old[key]?.trim()?old:{...old,[key]:text}}),onRegisterFlush,onStoryTouched})
  const busy=!!conversation.state?.job&&['queued','running'].includes(conversation.state.job.status)
  const failed=!!conversation.state?.job&&['failed','cancelled'].includes(conversation.state.job.status)
  const unread=!!conversation.state?.reply?.pages.some(page=>page.revealedGraphemeCount<page.graphemeCount)
  const heading=useId(),hint=useId()
  useEffect(()=>setNeedsStory(false),[partnerId,activeStoryId])
  useEffect(()=>{
    if(!open){setNeedsStory(false);return}
    const frame=requestAnimationFrame(()=>input.current?.focus({preventScroll:true}))
    return()=>cancelAnimationFrame(frame)
  },[open,focusRequest])
  useEffect(()=>{
    if(!open)return
    const escape=(event:globalThis.KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||composing.current||event.keyCode===229)return
      event.preventDefault()
      if(needsStory){setNeedsStory(false);input.current?.focus({preventScroll:true})}
      else onClose()
    }
    window.addEventListener('keydown',escape)
    return()=>window.removeEventListener('keydown',escape)
  },[open,needsStory,onClose])
  const submit=()=>{
    if(!open||composing.current||!draft.trim())return
    if(native){void conversation.send(draft);return}
    setNeedsStory(true)
  }
  const keyDown=(event:KeyboardEvent)=>{
    if(event.nativeEvent.isComposing||composing.current||event.keyCode===229)return
    if(event.key==='Enter'&&event.target===input.current&&!event.shiftKey){
      event.preventDefault()
      if(!event.repeat)submit()
    }
  }
  return <section ref={panel} className="home-chat" data-testid="home-chat" data-open={open} inert={!open} aria-hidden={!open} aria-label={`与 ${partnerName} 的首页聊天`} onKeyDown={keyDown}>
    <header className="home-chat__header">
      <h2 id={heading}>{partnerName}</h2><span className="home-chat__rule"/>
      <button className="quiet-button" aria-label="收起聊天" onClick={onClose}><Icon name="close" resources={resources}/></button>
    </header>
    <div className="home-chat__reply" role={native?'log':'status'} aria-live={native?'off':'polite'}>
      {native?<>
        <HomeReply state={conversation.state} visible={open&&documentVisible&&panelReady&&!conversation.submitting} typewriter={typewriter} charsPerSecond={charsPerSecond} onPresented={conversation.markPresented} onPose={onPose}/>
        {conversation.state?.providerConfigured===false&&<p className="home-chat__job">请先配置模型，草稿不会自动发送。<button type="button" className="home-chat__create" onClick={onOpenSettings}>配置模型</button></p>}
        {(conversation.error||conversation.state?.job?.error)&&<p className="home-chat__error" role="alert">{conversation.error||conversation.state?.job?.error?.message}</p>}
        <div className="home-chat__controls">
          {(busy||unread)&&<button type="button" className="home-chat__create" disabled={conversation.submitting} onClick={()=>void conversation.stop()}>{busy?'停止生成':'停止显示'}</button>}
          {failed&&<button type="button" className="home-chat__create" disabled={conversation.submitting} onClick={()=>void conversation.retry()}>重试原消息</button>}
        </div>
      </>:needsStory?<div className="home-chat__onboarding">
        <strong>{activeStoryId?'聊天服务尚未接入':'先创建一个故事'}</strong>
        <p>{activeStoryId?'当前故事已经就绪，刚才输入的内容仍作为草稿保留，没有发送给模型。':'让这段对话有一个存档。刚才输入的内容会保留。'}</p>
        {!activeStoryId&&<button className="home-chat__create" onClick={onCreateStory}>新建故事 <span aria-hidden="true">›</span></button>}
      </div>:<p>我在。今天有什么<br/>想和我聊的吗？</p>}
    </div>
    <form className="home-chat__composer" onSubmit={event=>{event.preventDefault();submit()}}>
      <textarea ref={input} rows={2} maxLength={8000} value={draft} aria-label={`想和 ${partnerName} 说些什么？`} placeholder={`想和 ${partnerName} 说些什么？`} aria-describedby={hint}
        onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}}
        onChange={event=>{setDraft(event.target.value);setNeedsStory(false)}}/>
      <button className="home-chat__send" type="submit" aria-label="发送消息" disabled={!draft.trim()||native&&conversation.submitting}>{native&&conversation.submitting?'提交中':'发送'}<Icon name="send" resources={resources}/></button>
    </form>
    <p className="home-chat__hint" id={hint}>Enter 发送 · Shift+Enter 换行</p>
  </section>
}
