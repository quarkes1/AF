import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'

/** No-save composer: drafts are local to this mounted home, never a fabricated conversation. */
export function HomeChat({open,focusRequest,partnerId,partnerName,resources,onClose,onCreateStory}:{
  open:boolean;focusRequest:number;partnerId:string;partnerName:string;resources:ResourceCatalog;onClose:()=>void;onCreateStory:()=>void
}) {
  const input=useRef<HTMLTextAreaElement>(null)
  const composing=useRef(false)
  const [drafts,setDrafts]=useState<Record<string,string>>({})
  const draft=drafts[partnerId]??''
  const setDraft=(value:string)=>setDrafts(old=>({...old,[partnerId]:value}))
  const [needsStory,setNeedsStory]=useState(false)
  const heading=useId(),hint=useId()
  useEffect(()=>setNeedsStory(false),[partnerId])
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
    setNeedsStory(true)
  }
  const keyDown=(event:KeyboardEvent)=>{
    if(event.nativeEvent.isComposing||composing.current||event.keyCode===229)return
    if(event.key==='Enter'&&event.target===input.current&&!event.shiftKey){
      event.preventDefault()
      if(!event.repeat)submit()
    }
  }
  return <section className="home-chat" data-testid="home-chat" data-open={open} inert={!open} aria-hidden={!open} aria-label={`与 ${partnerName} 的首页聊天`} onKeyDown={keyDown}>
    <header className="home-chat__header">
      <h2 id={heading}>{partnerName}</h2><span className="home-chat__rule"/>
      <button className="quiet-button" aria-label="收起聊天" onClick={onClose}><Icon name="close" resources={resources}/></button>
    </header>
    <div className="home-chat__reply" role="status" aria-live="polite">
      {needsStory?<div className="home-chat__onboarding">
        <strong>先创建一个故事</strong>
        <p>让这段对话有一个存档。刚才输入的内容会保留。</p>
        <button className="home-chat__create" onClick={onCreateStory}>新建故事 <span aria-hidden="true">›</span></button>
      </div>:<p>我在。今天有什么<br/>想和我聊的吗？</p>}
    </div>
    <form className="home-chat__composer" onSubmit={event=>{event.preventDefault();submit()}}>
      <textarea ref={input} rows={2} maxLength={8000} value={draft} aria-label={`想和 ${partnerName} 说些什么？`} placeholder={`想和 ${partnerName} 说些什么？`} aria-describedby={hint}
        onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}}
        onChange={event=>{setDraft(event.target.value);setNeedsStory(false)}}/>
      <button className="home-chat__send" type="submit" aria-label="发送消息" disabled={!draft.trim()}>发送<Icon name="send" resources={resources}/></button>
    </form>
    <p className="home-chat__hint" id={hint}>Enter 发送 · Shift+Enter 换行</p>
  </section>
}
