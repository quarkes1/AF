import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {HomePage,HomeState} from '../../../shared/contracts/home-chat'
import {graphemePrefix,splitGraphemes} from '../../../shared/graphemes'

export function HomeReply({state,visible,typewriter,charsPerSecond,onPresented,onPose}:{state:HomeState|null;visible:boolean;typewriter:boolean;charsPerSecond:number;onPresented:(page:HomePage,count:number)=>void;onPose?:(tag:string|null)=>void}){
 const [counts,setCounts]=useState<Record<string,number>>({}),pages=state?.reply?.pages??[],identity=pages.map(p=>p.pageId).join('|'),replyId=state?.reply?.replyId
 const callbacks=useRef({onPresented,onPose}),countRef=useRef(counts);callbacks.current={onPresented,onPose};countRef.current=counts
 const replyElement=useRef<HTMLDivElement>(null),pageRef=useRef(pages),follow=useRef(true),scrolling=useRef(0),observed=useRef(new Map<string,number>()),bulk=useRef<string|null>(null),positioned=useRef<string|null>(null);pageRef.current=pages
 const rendered=(page:HomePage)=>Math.max(counts[page.pageId]??0,page.revealedGraphemeCount)
 const current=pages.find(page=>Math.min(rendered(page),Math.max(page.revealedGraphemeCount,observed.current.get(page.pageId)??0))<page.graphemeCount)
 useEffect(()=>{follow.current=true;bulk.current=null;positioned.current=null;observed.current.clear();setCounts(old=>Object.fromEntries(pages.filter(p=>old[p.pageId]!==undefined).map(p=>[p.pageId,old[p.pageId]])));return()=>callbacks.current.onPose?.(null)},[replyId])
 useEffect(()=>{if(!visible)callbacks.current.onPose?.(null);else follow.current=true},[visible])
 useLayoutEffect(()=>{
  if(!visible||!follow.current&&!bulk.current)return
  const viewport=replyElement.current?.closest<HTMLElement>('.home-chat__reply'),page=[...pages].reverse().find(p=>rendered(p)>0);if(!viewport||!page)return
  const node=replyElement.current?.querySelector(`[data-page-id="${page.pageId}"]`)?.firstChild;if(!node||node.nodeType!==Node.TEXT_NODE)return
  const end=node.textContent?.length??0;if(!end)return
  const isBulk=bulk.current===page.pageId
  if(isBulk&&positioned.current===page.pageId)return
  if(isBulk)positioned.current=page.pageId
  const offset=isBulk?splitGraphemes(page.text).slice(0,Math.max(page.revealedGraphemeCount,observed.current.get(page.pageId)??0)).join('').length:end-1
  const range=document.createRange();range.setStart(node,Math.min(offset,end-1));range.setEnd(node,isBulk?Math.min(offset+1,end):end);const rect=range.getBoundingClientRect(),bounds=viewport.getBoundingClientRect()
  if(rect.bottom>bounds.bottom||rect.top<bounds.top){scrolling.current=performance.now()+100;viewport.scrollTop+=rect.bottom>bounds.bottom?rect.bottom-bounds.bottom:rect.top-bounds.top}
 },[counts,visible,identity])
 useEffect(()=>{
  if(!visible||!current)return
  const id=current.pageId,start=Math.max(countRef.current[id]??0,current.revealedGraphemeCount),started=performance.now()
  let lastTick=started,elapsed=0
  const update=()=>{const now=performance.now();if(follow.current)elapsed+=now-lastTick;lastTick=now;if(!follow.current)return;const whole=!typewriter||current.kind==='narration';if(whole){bulk.current=id;positioned.current=null;follow.current=false}setCounts(old=>{const count=whole?current.graphemeCount:Math.min(current.graphemeCount,start+Math.floor(elapsed*Math.max(3,Math.min(5,charsPerSecond))/1000));return count>(old[id]??0)?{...old,[id]:count}:old})}
  update();const timer=setInterval(update,40);return()=>clearInterval(timer)
 },[visible,current?.pageId,identity,typewriter,charsPerSecond])
 useEffect(()=>{
  if(!visible)return
  const viewport=replyElement.current?.closest<HTMLElement>('.home-chat__reply');if(!viewport)return
  let frame=0,previous=new Map<string,number>()
  let userScrollUntil=0,upward=false
  const wheel=(event:WheelEvent)=>{userScrollUntil=performance.now()+1000;upward=event.deltaY<0;if(upward)follow.current=false}
  const pointer=(event:PointerEvent)=>{if(event.target===viewport){userScrollUntil=performance.now()+2000;upward=false}}
  const key=(event:KeyboardEvent)=>{if(['ArrowUp','PageUp','Home'].includes(event.key)){userScrollUntil=performance.now()+1000;upward=true;follow.current=false}else if(['ArrowDown','PageDown','End'].includes(event.key)){userScrollUntil=performance.now()+1000;upward=false}}
  const scroll=()=>{if(performance.now()<userScrollUntil&&performance.now()>scrolling.current)follow.current=!upward&&viewport.scrollTop+viewport.clientHeight>=viewport.scrollHeight-32}
  viewport.addEventListener('scroll',scroll)
  viewport.addEventListener('wheel',wheel,{passive:true});viewport.addEventListener('pointerdown',pointer);viewport.addEventListener('keydown',key)
  const inspect=()=>{
   const bounds=viewport.getBoundingClientRect()
   for(const page of pageRef.current){
    const element=replyElement.current?.querySelector<HTMLElement>(`[data-page-id="${page.pageId}"]`),node=element?.firstChild
    if(!node||node.nodeType!==Node.TEXT_NODE)continue
    const glyphs=splitGraphemes(page.text),limit=Math.min(previous.get(page.pageId)??0,glyphs.length),start=Math.max(page.revealedGraphemeCount,observed.current.get(page.pageId)??0)
    let count=start,offset=glyphs.slice(0,start).join('').length
    for(;count<limit;count++){
     const next=offset+glyphs[count].length;if(next>(node.textContent?.length??0))break
     const range=document.createRange();range.setStart(node,offset);range.setEnd(node,next);const rect=range.getBoundingClientRect()
     if(rect.height>0&&(rect.top<bounds.top||rect.bottom>bounds.bottom||rect.right<bounds.left||rect.left>bounds.right))break
     offset=next
    }
    if(count>start){observed.current.set(page.pageId,count);callbacks.current.onPresented(page,count);callbacks.current.onPose?.(page.poseTag)}
    if(count===page.graphemeCount&&bulk.current===page.pageId){bulk.current=null;positioned.current=null;follow.current=true}
    if(count<page.graphemeCount)break
   }
   previous=new Map(pageRef.current.map(page=>[page.pageId,Math.max(countRef.current[page.pageId]??0,page.revealedGraphemeCount)]))
   frame=requestAnimationFrame(inspect)
  }
  frame=requestAnimationFrame(inspect)
  return()=>{cancelAnimationFrame(frame);viewport.removeEventListener('scroll',scroll);viewport.removeEventListener('wheel',wheel);viewport.removeEventListener('pointerdown',pointer);viewport.removeEventListener('keydown',key)}
 },[visible,identity])
 const history=state?.history.filter(m=>!pages.length||m.id!==replyId)??[]
 const busy=!!state?.job&&['queued','running'].includes(state.job.status)
 return <>
  {history.map(message=><div className={`home-chat__message home-chat__message--${message.role}`} key={message.id}><small>{message.name}</small><p>{message.text}</p></div>)}
  {!!pages.length&&<div ref={replyElement} className="home-chat__message home-chat__message--assistant" data-testid="home-current-reply">{pages.map(page=><p key={page.pageId} data-page-id={page.pageId}>{graphemePrefix(page.text,rendered(page))}</p>)}</div>}
  {!history.length&&!pages.length&&!busy&&<p>我在。今天有什么<br/>想和我聊的吗？</p>}
  {busy&&<p className="home-chat__job" role="status">{state?.job?.cancelRequestedAt?'正在停止…':'正在回应…'}</p>}
  {state?.reply?.stopped&&<p className="home-chat__job">已停止显示，未显示的部分不会进入共同历史。</p>}
  {current&&rendered(current)<current.graphemeCount&&<button className="home-chat__create" type="button" onClick={()=>{bulk.current=current.pageId;positioned.current=null;follow.current=false;setCounts(old=>({...old,[current.pageId]:current.graphemeCount}))}}>显示本段全文</button>}
 </>
}
