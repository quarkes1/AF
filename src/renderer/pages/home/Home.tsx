import type {HomePlayback} from '../../audio/home-playback'
import { useEffect, useRef, useState } from 'react'
import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'
import {focusWhenVisible} from '../../components/focus'
import { useHomeParallax } from './useHomeParallax'
import { HomeChat } from './HomeChat'
import {CompanionPortrait} from '../companions/CompanionPortrait'
import type {CompanionView} from '../companions/model'
import type {StoryView} from '../saves/model'
import {homeStorySummary} from './summary'
import {HomeMedia,type MediaPanel,type MediaChoices} from './HomeMedia'

/** No fabricated save: this is the real empty home of the first frontend slice. */
export function Home({ background,backgroundPosition,backgrounds,musics,onBackground,onOpenMaterials,playback,onToggleMusic,onSeekMusic,stories,onContinueStory,musicId,onMusic, companion, resources, assetWarning, muted, onMute, onOpenSaves, onOpenLearning, onOpenCompanions, onOpenSettings, covered=false, entryFromTitle = false, transitioning = false, reducedMotion = false }: {
  background:string;backgroundPosition:number;backgrounds:MediaChoices;musics:MediaChoices;onBackground:(id:string)=>void;onOpenMaterials:()=>void;playback:HomePlayback;onToggleMusic:()=>Promise<boolean>;onSeekMusic:(seconds:number)=>boolean;stories:readonly StoryView[];onContinueStory:(id:string)=>void;musicId:string;onMusic:(id:string)=>Promise<boolean>;companion:CompanionView;resources: ResourceCatalog; assetWarning: string | null; muted: boolean; onMute: () => void; onOpenSaves:(create?:boolean)=>void;onOpenLearning:()=>void;onOpenCompanions:()=>void;onOpenSettings:()=>void;covered?:boolean;entryFromTitle?: boolean; transitioning?: boolean; reducedMotion?: boolean
}) {
  const summary=homeStorySummary(stories)
  const [mediaPanel,setMediaPanel]=useState<MediaPanel>(null)
  const [pendingMusic,setPendingMusic]=useState<string|null>(null),[musicError,setMusicError]=useState<string|null>(null)
  const musicRequest=useRef(0)
  const changeMusic=async(id:string)=>{const request=++musicRequest.current;setPendingMusic(id);setMusicError(null);try{const changed=await onMusic(id);if(request===musicRequest.current&&!changed)setMusicError('这首曲目暂时无法播放，已保留原来的音乐。')}catch{if(request===musicRequest.current)setMusicError('音乐切换失败，已保留原曲。')}finally{if(request===musicRequest.current)setPendingMusic(null)}}
  const toggleMusic=async()=>{const request=++musicRequest.current;setPendingMusic(null);setMusicError(null);try{if(!await onToggleMusic()&&request===musicRequest.current)setMusicError('音乐暂时无法播放，请重试。')}catch{if(request===musicRequest.current)setMusicError('音乐暂时无法播放，请重试。')}}
  const [backgroundMissing, setBackgroundMissing] = useState(false)
  useEffect(()=>setBackgroundMissing(false),[background])
  const [notice, setNotice] = useState<string | null>(null)
  const [chatOpen,setChatOpen]=useState(false)
  const [chatFocusRequest,setChatFocusRequest]=useState(0)
  const portrait=useRef<HTMLButtonElement>(null)
  const returnFocus=useRef<HTMLElement|null>(null)
  const wasCovered=useRef(false)
  const motionRef = useHomeParallax(!transitioning && !covered && !reducedMotion && mediaPanel!=='backgrounds')
  useEffect(()=>{
    if(covered){setChatOpen(false);setMediaPanel(null)}
    const restore=!covered&&wasCovered.current?focusWhenVisible(()=>returnFocus.current):undefined
    wasCovered.current=covered
    return restore
  },[covered])
  const openSaves=(element:HTMLElement|null,create=false)=>{returnFocus.current=element;setChatOpen(false);setNotice(null);setMediaPanel(null);onOpenSaves(create)}
  const unavailable = (name: string) => { setChatOpen(false);setNotice(`${name}将在后续界面阶段接入，当前未创建或修改任何存档。`) }
  const openChat=()=>{
    setMediaPanel(null);setNotice(null);setChatOpen(true)
    // Repeated portrait clicks focus the existing composer without remounting it.
    setChatFocusRequest(value=>value+1)
  }
  const closeChat=()=>{setChatOpen(false);portrait.current?.focus({preventScroll:true})}
  return <main ref={motionRef} className={`home${entryFromTitle ? ' home--from-title' : ''}`} inert={transitioning} data-testid="home" data-bg-picking={mediaPanel==='backgrounds'} data-music-open={mediaPanel==='music'} aria-label="Aurora Forge 首页">
    <div className="home__scene" inert={mediaPanel==='backgrounds'}>
    {!backgroundMissing && background && <img className="home__background" alt="" src={resources.url(background)} style={{objectPosition:`${backgroundPosition}% center`}} onError={() => setBackgroundMissing(true)} />}
    <header className="home__header">
      <img className="home__brand" src={resources.url('brand.logo.inverse')} alt="Aurora Forge" />
      <div className="home__top-actions">
        <button className="quiet-button" data-ui-sound="none" onClick={onMute} aria-label={muted ? '开启声音' : '关闭声音'} aria-pressed={muted}><Icon name={muted ? 'volume-off' : 'volume'} resources={resources} /></button>
        <span className="home__header-divider" />
        <button className="quiet-button" onClick={event=>{returnFocus.current=event.currentTarget;setChatOpen(false);setNotice(null);onOpenSettings()}}><Icon name="settings" resources={resources} />设置</button>
      </div>
    </header>
    <button ref={portrait} className="home__portrait" aria-label={`与 ${companion.name} 聊聊`} aria-expanded={chatOpen} onClick={openChat}>
      <CompanionPortrait image={companion.sprites[companion.defaultPose]} name={companion.name} resources={resources}/>
    </button>
    <div className="home__portrait-hint" hidden={chatOpen}><Icon name="mouse" resources={resources} />点击搭档，与 TA 聊聊 <span>›</span></div>
    <section className="home__navigation" aria-label="主要功能">
      <button className="home__save panel-button" onClick={event=>openSaves(event.currentTarget)}><Icon name="folder" resources={resources} /><strong>存档</strong><span>{summary.latest?`最近存档 · ${summary.latest.partner}`:'尚无故事存档'}</span><span>›</span></button>
      <button className="home__story" onClick={event=>{if(summary.latest){returnFocus.current=event.currentTarget;setChatOpen(false);setMediaPanel(null);onContinueStory(summary.latest.id)}else openSaves(event.currentTarget,true)}}>
        <img className="home__story-art" alt="" src={resources.url('background.campus-courtyard-day')} />
        <div className="home__story-content">
          <span className="home__short-rule" /><span className="home__story-label">STORY</span>
          <h2>{summary.action} <span className="home__arrow">→</span></h2>
          <p className="home__story-chapter" title={summary.chapter}>{summary.chapter}</p>
          <span className="home__short-rule home__short-rule--lower" />
          <p className="home__story-note" title={summary.fullLine}>{summary.line}</p>
        </div>
      </button>
      <div className="home__tiles">
        {[
          ['book-open', '章节学习', '回顾课程 · 提升自己'],
          ['user', '搭档档案', '关于 TA · 更多的故事'],
          ['folder', '资料管理', '笔记 · 文件 · 收藏'],
        ].map(([icon, title, subtitle]) => <button key={title} className="home__tile panel-button" onClick={event=>{if(title==='章节学习'||title==='搭档档案'||title==='资料管理'){returnFocus.current=event.currentTarget;setChatOpen(false);setNotice(null);setMediaPanel(null);if(title==='章节学习')onOpenLearning();else if(title==='搭档档案')onOpenCompanions();else onOpenMaterials()}else unavailable(title)}}>
          <Icon name={icon} resources={resources} /><span className="home__tile-rule" />
          <strong>{title}<span>›</span></strong><small>{subtitle}</small><span className="home__tile-accent" />
        </button>)}
      </div>
    </section>
    <div className="home__greeting" hidden={chatOpen}><span /><p><b>{companion.name}</b>：今天想接着聊，还是一起看看课本？</p></div>
    <HomeChat open={chatOpen} focusRequest={chatFocusRequest} partnerId={companion.id} partnerName={companion.name} resources={resources} onClose={closeChat} onCreateStory={()=>openSaves(portrait.current,true)}/>
    {assetWarning && <div className="home__asset-warning" role="status">{assetWarning}</div>}
    {notice && <div className="home__notice" role="status"><span>{notice}</span><button className="quiet-button" onClick={() => setNotice(null)} aria-label="关闭提示">×</button></div>}
    </div>
    <HomeMedia backgrounds={backgrounds} musics={musics} playback={playback} onToggleMusic={()=>{void toggleMusic()}} onSeekMusic={onSeekMusic} active={!covered} panel={mediaPanel} onPanel={panel=>{setMediaPanel(panel);if(panel)setChatOpen(false)}} resources={resources} background={background} onBackground={id=>{onBackground(id);setBackgroundMissing(false)}} musicId={musicId} onMusic={id=>{void changeMusic(id)}} pending={pendingMusic} error={musicError}/>
  </main>
}
