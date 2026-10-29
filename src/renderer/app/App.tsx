import { useEffect, useState, useSyncExternalStore, useRef, useCallback, type CSSProperties } from 'react'
import type { ResourceCatalog } from './resources'
import { readPreviewPreferences,writePreviewPreferences } from './preview-preferences'
import { Splash } from '../features/startup/Splash'
import type { StartupController } from '../features/startup/controller'
import { Home } from '../pages/home/Home'
import { shouldEnterFromTitle, shouldSkipStartup } from '../features/startup/keyboard'
import { TitleScreen } from '../features/startup/TitleScreen'
import { STARTUP_TIMINGS, TITLE_TO_HOME_MS } from '../features/startup/timings'
import { SaveScreen } from '../pages/saves/SaveScreen'
import { reviewStories,reviewArchiveCompanion } from '../pages/saves/review-fixtures'
import { CourseScreen } from '../pages/learning/CourseScreen'
import { reviewCourses } from '../pages/learning/review-fixtures'
import { CompanionScreen } from '../pages/companions/CompanionScreen'
import { builtInCompanion,reviewCompanions,type CompanionView } from '../pages/companions/model'
import {cloneCompanion,initialSelection,chooseCompanion,enterStory,reconcileSelection} from '../pages/companions/selection'
import type {StoryView} from '../pages/saves/model'
import {SettingsScreen} from '../pages/settings/SettingsScreen'
import {updatePreferences,type SettingsPreferences} from '../pages/settings/model'
import {readHomeMusic,rememberHomeMusic,resolveHomeMusic} from '../pages/home/music'

import {ILLUSTRATIONS,MUSIC_TRACKS} from '../pages/materials/application-resources'
import {MaterialScreen} from '../pages/materials/MaterialScreen'
import type {MaterialLibrary} from '../pages/materials/library'
import {HOME_BACKGROUNDS,readHomeBackground,rememberHomeBackground} from '../pages/home/backgrounds'

const startupStyle = {
  '--startup-logo-fade-in': `${STARTUP_TIMINGS.logoFadeIn}ms`,
  '--startup-logo-fade-out': `${STARTUP_TIMINGS.logoFadeOut}ms`,
  '--title-fade-out': `${STARTUP_TIMINGS.titleFadeOut}ms`,
  '--title-to-home': `${TITLE_TO_HOME_MS}ms`,
} as CSSProperties

export function App({ controller, resources,library }: { controller: StartupController; resources: ResourceCatalog;library:MaterialLibrary }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const playback=useSyncExternalStore(controller.subscribeHome,controller.getHomePlayback)
  const libraryState=useSyncExternalStore(library.subscribe,library.getSnapshot)
  const backgrounds=[...HOME_BACKGROUNDS,...ILLUSTRATIONS.filter(item=>item.role==='background'&&!HOME_BACKGROUNDS.some(([id])=>id===item.id)).map(item=>[item.id,item.name] as const),...libraryState.items.filter(item=>item.kind==='background').map(item=>[item.id,item.name] as const)]
  const musics=[...MUSIC_TRACKS,...libraryState.items.filter(item=>item.kind==='music').map(item=>[item.id,item.name] as const)]
  const [materialsOpen,setMaterialsOpen]=useState(false),[resourcePreview,setResourcePreview]=useState<string|null>(null)
  const [background,setBackground]=useState(()=>{const saved=readHomeBackground();return resources.has(saved)?saved:HOME_BACKGROUNDS[0][0]})
  const useBackground=(id:string)=>{if(resources.has(id)){setBackground(id);rememberHomeBackground(id)}}
  const audition=useRef<{id:string;resume:boolean}|null>(null)
  const onAudition=useCallback((active:boolean,resume=true)=>{
    if(active){if(audition.current)return;const playing=controller.getHomePlayback();audition.current={id:playing.id,resume:playing.playing||playing.loading};if(playing.playing||playing.loading)void controller.toggleHomeMusic()}
    else {const previous=audition.current;audition.current=null;const playing=controller.getHomePlayback();if(resume&&previous?.resume&&previous.id===playing.id&&!playing.playing&&!playing.loading)void controller.toggleHomeMusic()}
  },[controller])
  useEffect(()=>{if(!resourcePreview)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setResourcePreview(null)}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[resourcePreview])

  const [preferences,setPreferences]=useState(readPreviewPreferences)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [settingsReturn,setSettingsReturn]=useState<'companions'|'saves'|null>(null)
  const [preferenceWarning,setPreferenceWarning]=useState<string|null>(null)
  const applyPreferences=(patch:Partial<SettingsPreferences>)=>{const next=updatePreferences(preferences,patch);setPreferences(next);if(writePreviewPreferences(next)===false)setPreferenceWarning('本地保存受限，更改仅在本次运行中生效。');else setPreferenceWarning(null)}
  useEffect(()=>{controller.configureAudio(preferences);controller.setMuted(preferences.muted);controller.setReducedMotion(preferences.reducedMotion);document.documentElement.style.fontSize=`${16*preferences.uiScale/100}px`},[preferences,controller])
  useEffect(()=>{const blur=()=>controller.setFocused(false),focus=()=>controller.setFocused(true);window.addEventListener('blur',blur);window.addEventListener('focus',focus);return()=>{window.removeEventListener('blur',blur);window.removeEventListener('focus',focus)}},[controller])
  const [stories,setStories]=useState<StoryView[]>(()=>import.meta.env.VITE_SAVE_REVIEW==='1'?[...reviewStories]:[])
  const [resumeRequest,setResumeRequest]=useState<{id:string;sequence:number}>()
  const [homeMusic,setHomeMusic]=useState<string>(()=>resolveHomeMusic(readHomeMusic(),resources.has)??'bgm.home.suno-01')
  const changeMusic=async(id:string)=>{const played=await controller.switchHomeMusic(id);if(played){setHomeMusic(id);rememberHomeMusic(id)}return played}
  const continueStory=(id:string)=>{setSettingsReturn(null);setResumeRequest(old=>({id,sequence:(old?.sequence??0)+1}));setSavesOpen(true)}
  const [savesOpen,setSavesOpen]=useState(false)
  const [learningOpen,setLearningOpen]=useState(false)
  const [companionsOpen,setCompanionsOpen]=useState(false)
  const [companions,setCompanions]=useState<CompanionView[]>(()=>[cloneCompanion(builtInCompanion),...(import.meta.env.VITE_COMPANION_REVIEW==='1'?reviewCompanions():[]),...(import.meta.env.VITE_SAVE_REVIEW==='1'?[cloneCompanion(reviewArchiveCompanion)]:[])])
  const [selection,setSelection]=useState(initialSelection)
  useEffect(()=>{setSelection(current=>reconcileSelection(current,companions))},[companions])
  const portraitAvailable=(value:CompanionView)=>{const image=value.sprites[value.defaultPose];return !!image&&(image.startsWith('data:image/png;base64,')||resources.has(image))}
  const select=(companion:CompanionView)=>{const next=chooseCompanion(companion);if(!next||!portraitAvailable(companion))return false;setSelection(next);return true}
  const enter=(story:StoryView)=>{const next=enterStory(story,companions);if(!next||!portraitAvailable(next.companion))return false;setSelection(next);return true}
  const [createRequest,setCreateRequest]=useState(0)
  const openSaves=(create=false)=>{if(create)setCreateRequest(value=>value+1);setSavesOpen(true)}
  const onMute = () => {
    const muted=!preferences.muted;applyPreferences({muted});controller.setMuted(muted)
    if(!muted)controller.playUi()
  }

  useEffect(() => {
    controller.start()
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const focus = target.closest('input, textarea, select, [contenteditable="true"]') ? 'editable' : target.closest('button') ? 'button' : 'none'
      const phase = controller.getSnapshot().phase
      if (phase === 'waiting' && shouldEnterFromTitle(event, focus)) {
        event.preventDefault(); controller.enterHome()
      } else if (['black','logo'].includes(phase) && shouldSkipStartup(event, focus)) {
        event.preventDefault(); controller.skip()
      }
    }
    window.addEventListener('keydown', key)
    const dispose = () => controller.dispose()
    window.addEventListener('pagehide', dispose)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pagehide', dispose); controller.dispose() }
  }, [controller])
  return <div className="app" data-motion={state.reducedMotion ? 'reduced' : 'full'} style={startupStyle} onClickCapture={event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('button,summary,[role="button"],input[type="checkbox"],input[type="radio"]')
    if(!button||button.matches(':disabled,[aria-disabled="true"]')||button.dataset.uiSound==='none')return
    controller.playUi(button.dataset.uiSound==='back'?'back':button.dataset.uiSound==='confirm'?'confirm':'press')
  }}>
    {['enteringHome','home'].includes(state.phase) && <>
      <div className="home-layer" data-covered={savesOpen||learningOpen||companionsOpen||settingsOpen||(materialsOpen&&!resourcePreview)} inert={savesOpen||learningOpen||companionsOpen||settingsOpen||(materialsOpen&&!resourcePreview)} aria-hidden={savesOpen||learningOpen||companionsOpen||settingsOpen||(materialsOpen&&!resourcePreview)}><Home background={resourcePreview??background} backgroundPosition={libraryState.items.find(item=>item.id===(resourcePreview??background))?.position??50} backgrounds={backgrounds} musics={musics} onBackground={useBackground} onOpenMaterials={()=>setMaterialsOpen(true)} playback={playback} onToggleMusic={controller.toggleHomeMusic} onSeekMusic={controller.seekHomeMusic} stories={stories} onContinueStory={continueStory} musicId={homeMusic} onMusic={changeMusic} companion={selection.companion} entryFromTitle transitioning={state.phase === 'enteringHome'||!!resourcePreview} covered={savesOpen||learningOpen||companionsOpen||settingsOpen||(materialsOpen&&!resourcePreview)} onOpenSettings={()=>setSettingsOpen(true)} onOpenCompanions={()=>{setSettingsReturn(null);setCompanionsOpen(true)}} onOpenSaves={openSaves} onOpenLearning={()=>setLearningOpen(true)} reducedMotion={state.reducedMotion} resources={resources} assetWarning={state.assetWarning} muted={state.muted} onMute={onMute}/></div>
      <CompanionScreen backLabel={settingsReturn==='companions'?'返回设置':'返回首页'} open={companionsOpen} resources={resources} onBack={()=>{setCompanionsOpen(false);if(settingsReturn==='companions'){setSettingsOpen(true);setSettingsReturn(null)}}} items={companions} onItemsChange={setCompanions} selectedCompanionId={selection.companion.id} onSelect={select}/>
      <SaveScreen backLabel={settingsReturn==='saves'?'返回设置':'返回首页'} open={savesOpen} resources={resources} onBack={()=>{setSavesOpen(false);if(settingsReturn==='saves'){setSettingsOpen(true);setSettingsReturn(null)}}} onEnterStory={enter} selectedCompanion={selection.companion.name} createRequest={createRequest} review={import.meta.env.VITE_SAVE_REVIEW==='1'} stories={stories} onStoriesChange={setStories} resumeRequest={resumeRequest}/>
      <SettingsScreen open={settingsOpen} resources={resources} preferences={preferences} onChange={applyPreferences} onBack={()=>setSettingsOpen(false)} companionName={selection.companion.name} storageWarning={preferenceWarning} onPreviewSound={()=>controller.playUi()} onCompanions={()=>{setSettingsReturn('companions');setSettingsOpen(false);setCompanionsOpen(true)}} onSaves={()=>{setSettingsReturn('saves');setSettingsOpen(false);setSavesOpen(true)}}/>
      <MaterialScreen audioPreferences={preferences} open={materialsOpen&&!resourcePreview} library={library} resources={resources} onBack={()=>setMaterialsOpen(false)} background={background} musicId={homeMusic} onUseBackground={useBackground} onUseMusic={changeMusic} onPreviewBackground={setResourcePreview} onAudition={onAudition}/>
      {resourcePreview&&<div className="home-resource-preview"><span>背景预览</span><button onClick={()=>{useBackground(resourcePreview);setResourcePreview(null)}}>应用此背景</button><button autoFocus onClick={()=>setResourcePreview(null)}>返回资料管理</button></div>}
      <CourseScreen preferences={preferences} open={learningOpen} resources={resources} onBack={()=>setLearningOpen(false)} review={import.meta.env.VITE_LEARNING_REVIEW==='1'} initialCourses={import.meta.env.VITE_LEARNING_REVIEW==='1'?reviewCourses:[]}/>
    </>}
    {['waiting','enteringHome'].includes(state.phase) && <TitleScreen resources={resources} reducedMotion={state.reducedMotion} entering={state.phase==='enteringHome'} muted={state.muted} onMute={onMute} onEnter={() => controller.enterHome()} />}
    {['black','logo','fadingOut'].includes(state.phase) && <Splash state={state} controller={controller} resources={resources} onMute={onMute} />}
  </div>
}
