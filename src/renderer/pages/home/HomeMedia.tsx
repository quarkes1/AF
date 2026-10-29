import {formatMusicTime,type HomePlayback} from '../../audio/home-playback'
import {useEffect,useRef} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {focusWhenVisible} from '../../components/focus'
import {HOME_BACKGROUNDS} from './backgrounds'
import {HOME_MUSIC} from './music'
export type MediaChoices=readonly (readonly [string,string])[]
import './home-media.css'

export type MediaPanel='backgrounds'|'music'|null
export function HomeMedia({backgrounds=HOME_BACKGROUNDS,musics=HOME_MUSIC,playback,onToggleMusic,onSeekMusic,active,panel,onPanel,resources,background,onBackground,musicId,onMusic,pending,error}:{backgrounds?:MediaChoices;musics?:MediaChoices;playback:HomePlayback;onToggleMusic:()=>void;onSeekMusic:(seconds:number)=>boolean;active:boolean;panel:MediaPanel;onPanel:(panel:MediaPanel)=>void;resources:ResourceCatalog;background:string|null;onBackground:(id:string)=>void;musicId:string;onMusic:(id:string)=>void;pending:string|null;error:string|null}){
  const root=useRef<HTMLDivElement>(null),backgroundButton=useRef<HTMLButtonElement>(null),musicButton=useRef<HTMLButtonElement>(null),previous=useRef<MediaPanel>(null),restoreOnClose=useRef(true)
  useEffect(()=>{
    if(!active){previous.current=null;return}
    const old=previous.current;previous.current=panel
    if(!panel){if(old&&restoreOnClose.current)return focusWhenVisible(()=>old==='backgrounds'?backgroundButton.current:musicButton.current);return}
    restoreOnClose.current=true
    return focusWhenVisible(()=>root.current?.querySelector<HTMLButtonElement>('.home-media-picker[aria-hidden="false"] button[aria-pressed="true"],.home-media-picker[aria-hidden="false"] button')??null)
  },[panel,active])
  useEffect(()=>{
    if(!panel)return
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.isComposing&&!event.defaultPrevented){event.preventDefault();onPanel(null)}}
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){restoreOnClose.current=false;onPanel(null)}}
    window.addEventListener('keydown',key);document.addEventListener('pointerdown',outside)
    return()=>{window.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside)}
  },[panel,onPanel])
  useEffect(()=>{
    if(panel!=='music')return
    const list=root.current?.querySelector<HTMLElement>('.home-music-options');if(!list)return
    const reveal=()=>{
      const selected=list.querySelector<HTMLElement>('button[aria-pressed="true"]');if(!selected)return
      const item=selected.getBoundingClientRect(),box=list.getBoundingClientRect()
      if(item.top<box.top)list.scrollTop+=item.top-box.top
      else if(item.bottom>box.bottom)list.scrollTop+=item.bottom-box.bottom
    }
    const observer=new ResizeObserver(reveal);observer.observe(list);reveal();return()=>observer.disconnect()
  },[panel,musicId])
  const tracks=musics.filter(([id])=>resources.has(id))
  const current=tracks.findIndex(([id])=>id===musicId)
  const step=(direction:number)=>{if(tracks.length>1)onMusic(tracks[(Math.max(0,current)+direction+tracks.length)%tracks.length][0])}
  const wheel=(event:React.WheelEvent<HTMLDivElement>)=>{if(!event.ctrlKey&&Math.abs(event.deltaY)>Math.abs(event.deltaX))event.currentTarget.scrollLeft+=event.deltaY}
  return <div className="home-media" ref={root}>
    {panel==='backgrounds'&&<button className="home-media-backdrop" aria-label="关闭背景选择" data-ui-sound="back" onClick={()=>onPanel(null)}/>}
    <section className="home-media-picker home-background-picker" role="dialog" aria-label="选择大厅背景" aria-hidden={panel!=='backgrounds'} inert={panel!=='backgrounds'} data-open={panel==='backgrounds'}>
      <header><span>大厅背景</span><button className="quiet-button" aria-label="收起背景列表" data-ui-sound="back" onClick={()=>onPanel(null)}><Icon name="close" resources={resources}/></button></header>
      <div className="home-background-options" tabIndex={0} aria-label="可横向滚动的背景列表" onWheel={wheel}>{backgrounds.filter(([id])=>resources.has(id)).map(([id,name])=><button key={id} aria-label={`使用背景 ${name}`} aria-pressed={background===id} onClick={()=>{onBackground(id);onPanel(null)}}><img src={resources.url(id)} alt="" draggable="false"/>{background===id&&<Icon name="check-circle" resources={resources}/>}</button>)}</div>
    </section>
    <section className="home-media-picker home-music-picker" role="dialog" aria-label="选择主页音乐" aria-hidden={panel!=='music'} inert={panel!=='music'} data-open={panel==='music'}>
      <div className="home-player-current">
        <div className="home-player-title"><Icon name="music" resources={resources}/><span role={error?'status':undefined} title={error??tracks[current]?.[1]}>{error??tracks[current]?.[1]??'暂无可用音乐'}</span></div>
        <div className="home-player-controls">
          <button aria-label="上一首" disabled={tracks.length<2} onClick={()=>step(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M19 5 8 12l11 7Z"/></svg></button>
          <button className="home-player-toggle" aria-label={playback.playing||playback.loading?'暂停主页音乐':'播放主页音乐'} disabled={!tracks.length} aria-busy={playback.loading} onClick={onToggleMusic}><Icon name={playback.playing||playback.loading?'pause':'play'} resources={resources}/></button>
          <button aria-label="下一首" disabled={tracks.length<2} onClick={()=>step(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M5 5l11 7-11 7Z"/></svg></button>
        </div>
        <div className="home-player-timeline"><input aria-label="音乐播放进度" type="range" style={{background:`linear-gradient(to right,var(--cyan) ${playback.duration?Math.min(100,playback.currentTime/playback.duration*100):0}%,#8da7b755 0)`}} min="0" max={playback.duration||1} step="0.1" value={Math.min(playback.currentTime,playback.duration||1)} disabled={!playback.duration} onChange={event=>onSeekMusic(Number(event.currentTarget.value))}/><div><span>{formatMusicTime(playback.currentTime)}</span><span>{playback.duration?formatMusicTime(playback.duration):'--:--'}</span></div></div>
      </div>
      <div className="home-music-options" tabIndex={0} aria-label="可上下滚动的主页曲目">{tracks.map(([id,name])=><button key={id} title={name} aria-label={`播放 ${name}`} aria-pressed={musicId===id} aria-busy={pending===id} onClick={()=>onMusic(id)}><span>{name}</span>{musicId===id&&<span className="home-player-bars" data-playing={playback.playing} aria-hidden="true"><i/><i/><i/></span>}</button>)}</div>
    </section>
    <div className="home-media-toolbar">
      <button ref={musicButton} className="home-media-trigger" aria-label="切换主页音乐" disabled={!musics.some(([id])=>resources.has(id))} title="选择主页 BGM" aria-expanded={panel==='music'} onClick={()=>onPanel(panel==='music'?null:'music')}><Icon name="music" resources={resources}/></button>
      <button ref={backgroundButton} className="home-media-trigger" aria-label="切换背景" disabled={!backgrounds.some(([id])=>resources.has(id))} title="选择大厅背景" aria-expanded={panel==='backgrounds'} onClick={()=>onPanel(panel==='backgrounds'?null:'backgrounds')}><Icon name="image" resources={resources}/></button>
    </div>
  </div>
}
