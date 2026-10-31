import {useEffect,useRef,useState} from 'react'
import type {RichBlock,SourceRef} from '../../../shared/contracts/experience'
import {Formula} from '../../math/Formula'
import {graphemeCount,graphemePrefix} from '../../../shared/graphemes'

export function visibleRich(blocks:RichBlock[],count:number,start=0){let offset=0;return blocks.flatMap<RichBlock>(block=>{const length=graphemeCount(block.kind==='text'?block.text:block.latex),from=Math.max(0,start-offset),to=Math.min(length,count-offset);offset+=length;if(to<=from)return[];if(block.kind==='math')return to===length?[block]:[];return[{...block,text:graphemePrefix(block.text,to).slice(graphemePrefix(block.text,from).length)}]})}
export function RichContent({blocks,onSource,onReady,showSources=true}:{blocks:RichBlock[];onSource?:(source:SourceRef)=>void;onReady?:(ready:boolean)=>void;showSources?:boolean}){
 const root=useRef<HTMLDivElement>(null),callback=useRef(onReady);callback.current=onReady
 const [ready,setReady]=useState(false),signature=JSON.stringify(blocks)
 useEffect(()=>{let active=true,frame=0;setReady(false);callback.current?.(false);void document.fonts.ready.then(()=>{frame=requestAnimationFrame(()=>{if(!active)return;const okay=!root.current?.querySelector('.math-fallback');setReady(okay);callback.current?.(okay)})});return()=>{active=false;cancelAnimationFrame(frame)}},[signature])
 return <div ref={root} className="experience-rich" data-layout-ready={ready}>{blocks.map((block,i)=><div className={`experience-block experience-block--${block.kind}`} key={i}>{block.kind==='math'?<><Formula latex={block.latex} inline={block.display==='inline'}/></>:<p>{block.text}</p>}{showSources&&!!block.sourceRefs.length&&<div className="experience-source">{[...new Map(block.sourceRefs.map(ref=>[ref.blockId,ref])).values()].map(ref=><button type="button" key={ref.blockId} onClick={()=>onSource?.(ref)}>来源 · 第 {ref.page} 页</button>)}</div>}</div>)}</div>
}
