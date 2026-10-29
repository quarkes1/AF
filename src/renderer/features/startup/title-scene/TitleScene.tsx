import { useEffect, useState } from 'react'
import type { ResourceCatalog } from '../../../app/resources'
import { requestedTitlePeriod, TITLE_BACKGROUNDS, type TitlePeriod } from './time'
import { SceneFrame } from './SceneFrame'

export function TitleScene({resources,reducedMotion}:{resources:ResourceCatalog;reducedMotion:boolean}) {
  const resolvePeriod=(period:TitlePeriod)=>resources.has(TITLE_BACKGROUNDS[period])?period:'day'
  const [requested,setRequested]=useState(()=>requestedTitlePeriod(new Date()))
  const [scene,setScene]=useState<{current:TitlePeriod;previous:TitlePeriod|null}>(()=>({current:resolvePeriod(requested),previous:null}))
  const [playing,setPlaying]=useState(false)
  useEffect(()=>{
    const refresh=()=>{setPlaying(!reducedMotion&&!document.hidden);setRequested(requestedTitlePeriod(new Date()))}
    refresh()
    const timer=setInterval(refresh,60000)
    document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh)}
  },[reducedMotion])
  useEffect(()=>{
    const period=resolvePeriod(requested)
    if(period===scene.current)return
    let cancelled=false
    const image=new Image();image.src=resources.url(TITLE_BACKGROUNDS[period])
    void image.decode().then(()=>{if(!cancelled)setScene(old=>({current:period,previous:old.current}))}).catch(()=>{/* Keep the last readable scene. */})
    return()=>{cancelled=true}
  },[requested,resources,scene.current])
  useEffect(()=>{
    if(!scene.previous)return
    const timer=setTimeout(()=>setScene(old=>({...old,previous:null})),reducedMotion?120:3000)
    return()=>clearTimeout(timer)
  },[scene.previous,reducedMotion])
  return <div className="title-scene" data-testid="title-scene" data-requested-period={requested} data-period={scene.current}>
    <SceneFrame resources={resources} period={scene.current} playing={playing} onImageError={()=>setScene(old=>old.current==='day'?old:{current:'day',previous:null})}/>
    {scene.previous && <SceneFrame key={scene.previous} resources={resources} period={scene.previous} playing={playing} previous/>}
  </div>
}
