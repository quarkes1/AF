import type { ResourceCatalog } from '../app/resources'
import type { BrandVariant, StartupAudio, UiCue } from '../features/startup/controller'
import {DEFAULT_PREFERENCES,type AudioPreferences} from '../pages/settings/model'
import {MUSIC_TRACKS} from '../pages/materials/application-resources'
import {EMPTY_HOME_PLAYBACK,type HomePlayback} from './home-playback'

/** Owns media independently of components so late play() resolutions cannot revive old audio. */
export class StartupAudioBus implements StartupAudio {
  private brand: HTMLAudioElement | null = null
  private home: HTMLAudioElement | null = null
  private confirmation: HTMLAudioElement | null = null
  private muted = false
  private disposed = false
  private fade?: ReturnType<typeof setInterval>
  private generation = 0
  private levels:AudioPreferences={...DEFAULT_PREFERENCES}
  private focused=true
  private fadeProgress=0
  private homeId:string='bgm.home.suno-01'
  private homeStarted=false
  private pendingHome:HTMLAudioElement|null=null
  private retiringHome:HTMLAudioElement|null=null
  private retiringGain=1
  private musicGeneration=0
  private homePaused=false
  private initialLoading=false
  private homeSnapshot:HomePlayback={...EMPTY_HOME_PLAYBACK}
  private homeListeners=new Set<()=>void>()
  private mediaWatches=new Map<HTMLAudioElement,()=>void>()
  constructor(private resources: ResourceCatalog, private makeAudio = (url: string) => new Audio(url)) {}
  configure(preferences:AudioPreferences){if(this.disposed)return;this.levels={...preferences};this.applyVolumes()}
  setFocused(focused:boolean){this.focused=focused;this.applyVolumes()}
  private gain(){return this.levels.masterVolume/100*(this.levels.attenuateOnBlur&&!this.focused?.25:1)}
  private applyVolumes(){
    const gain=this.gain()
    if(this.brand)this.brand.volume=gain*.5
    if(this.home)this.home.volume=gain*this.levels.bgmVolume/100*this.fadeProgress
    if(this.confirmation)this.confirmation.volume=gain*this.levels.sfxVolume/100
    if(this.retiringHome)this.retiringHome.volume=gain*this.levels.bgmVolume/100*this.retiringGain*(1-this.fadeProgress)
  }
  getHomePlayback=()=>this.homeSnapshot
  subscribeHome=(listener:()=>void)=>{this.homeListeners.add(listener);return()=>{this.homeListeners.delete(listener)}}
  private publishHome(){
    const audio=this.home,time=audio?.currentTime??0,duration=audio?.duration??0
    const next:HomePlayback={id:this.homeId,playing:!!audio&&this.homeStarted&&!this.homePaused&&!audio.paused,loading:!!this.pendingHome||this.initialLoading,currentTime:Number.isFinite(time)?Math.max(0,time):0,duration:Number.isFinite(duration)?Math.max(0,duration):0}
    if((Object.keys(next) as (keyof HomePlayback)[]).every(key=>next[key]===this.homeSnapshot[key]))return
    this.homeSnapshot=next;this.homeListeners.forEach(listener=>listener())
  }
  private watchHome(audio:HTMLAudioElement){
    const refresh=()=>{if(this.home===audio)this.publishHome()}
    const events=['timeupdate','durationchange','loadedmetadata','play','playing','pause','seeked','ended']
    events.forEach(event=>audio.addEventListener?.(event,refresh))
    audio.onerror=()=>{if(this.home===audio){this.homeStarted=false;this.initialLoading=false;this.publishHome()}}
    this.mediaWatches.set(audio,()=>{events.forEach(event=>audio.removeEventListener?.(event,refresh));audio.onerror=null})
  }
  private release(audio:HTMLAudioElement|null){if(audio){this.mediaWatches.get(audio)?.();this.mediaWatches.delete(audio);audio.pause();audio.removeAttribute('src');audio.load()}}
  setInitialHomeTrack(id:string){if(!this.home&&(MUSIC_TRACKS.some(([key])=>key===id)||id.startsWith('user.music.'))&&this.resources.has(id)){this.homeId=id;this.publishHome()}}
  private pauseHome(){
    this.homePaused=true;this.initialLoading=false;this.musicGeneration++
    this.release(this.pendingHome);this.pendingHome=null;this.release(this.retiringHome);this.retiringHome=null
    clearInterval(this.fade);this.fade=undefined;this.fadeProgress=1;this.home?.pause();this.applyVolumes();this.publishHome()
  }
  private async resumeHome():Promise<boolean>{
    if(this.disposed)return false
    if(!this.home||!this.homeStarted)return this.switchHome(this.homeId)
    const audio=this.home,generation=++this.musicGeneration;this.homePaused=false;this.initialLoading=true;this.publishHome()
    try{await audio.play();if(this.disposed||generation!==this.musicGeneration){if(this.disposed||this.homePaused||this.home!==audio)audio.pause();return false}this.initialLoading=false;this.publishHome();return true}
    catch{if(generation===this.musicGeneration){this.homePaused=true;this.initialLoading=false;this.publishHome()}return false}
  }
  toggleHome():Promise<boolean>{if(this.disposed)return Promise.resolve(false);if(this.pendingHome||this.initialLoading||this.homeSnapshot.playing){this.pauseHome();return Promise.resolve(true)}return this.resumeHome()}
  seekHome(seconds:number){
    if(this.disposed||!this.home||!Number.isFinite(seconds)||!Number.isFinite(this.home.duration)||this.home.duration<=0)return false
    try{this.home.currentTime=Math.max(0,Math.min(this.home.duration,seconds));this.publishHome();return true}catch{return false}
  }
  private fadeHome(){
    clearInterval(this.fade);this.fadeProgress=0
    const started=performance.now()
    this.fade=setInterval(()=>{
      this.fadeProgress=Math.min(1,(performance.now()-started)/800);this.applyVolumes()
      if(this.fadeProgress>=1){clearInterval(this.fade);this.fade=undefined;this.release(this.retiringHome);this.retiringHome=null}
    },16)
  }
  async switchHome(id:string):Promise<boolean>{
    if(this.disposed||!(MUSIC_TRACKS.some(([key])=>key===id)||id.startsWith('user.music.'))||!this.resources.has(id))return false
    const generation=++this.musicGeneration
    this.release(this.pendingHome);this.pendingHome=null
    if(this.home&&this.homeId===id&&this.homeStarted){this.publishHome();return this.homePaused||this.home.paused?this.resumeHome():true}
    const wasPaused=this.homePaused;this.homePaused=false
    let audio:HTMLAudioElement
    try{audio=this.makeAudio(this.resources.url(id))}catch{this.homePaused=wasPaused;this.publishHome();return false}
    this.pendingHome=audio;audio.volume=0;audio.muted=this.muted;audio.loop=true;this.watchHome(audio);this.publishHome()
    try{
      await audio.play()
      if(this.disposed||generation!==this.musicGeneration){this.release(audio);return false}
      this.release(this.retiringHome);this.retiringHome=this.home;this.retiringGain=this.fadeProgress
      this.home=audio;this.homeId=id;this.homeStarted=true;this.initialLoading=false;this.pendingHome=null;this.fadeHome();this.publishHome();return true
    }catch{if(this.pendingHome===audio)this.pendingHome=null;this.release(audio);if(generation===this.musicGeneration)this.homePaused=wasPaused;this.publishHome();return false}
  }
  setMuted(muted: boolean) {
    this.muted = muted
    if (this.brand) this.brand.muted = muted
    if (this.home) this.home.muted = muted
    if (this.confirmation) this.confirmation.muted = muted
    if(this.pendingHome)this.pendingHome.muted=muted
    if(this.retiringHome)this.retiringHome.muted=muted
  }
  playBrand(id: BrandVariant) {
    if (this.disposed || this.muted) return
    this.stopBrand()
    const generation = this.generation
    let audio: HTMLAudioElement
    try { audio = this.makeAudio(this.resources.url(id)) } catch { return }
    this.brand = audio
    audio.volume = this.gain() * .5
    audio.muted = this.muted
    audio.loop = false
    // HTMLAudio errors are intentionally silent and cannot block the screen.
    void audio.play().then(() => {
      if (this.disposed || generation !== this.generation) { audio.pause(); audio.removeAttribute('src'); audio.load() }
    }).catch(() => { if (this.brand === audio) this.brand = null })
  }
  stopBrand() {
    this.generation++
    if (this.brand) { this.brand.pause(); this.brand.removeAttribute('src'); this.brand.load(); this.brand = null }
  }
  startHome() {
    if (this.disposed || this.home) return
    let audio: HTMLAudioElement
    try { audio = this.makeAudio(this.resources.url(this.homeId)) } catch { return }
    this.home = audio
    this.initialLoading=true;this.watchHome(audio);this.publishHome()
    audio.volume = 0
    audio.muted = this.muted
    // Repeat the complete track without replacing the player or restarting on navigation.
    audio.loop = true
    this.fadeHome()
    void audio.play().then(() => {
      if (this.disposed || this.home !== audio || this.homePaused) audio.pause()
      else {this.homeStarted=true;this.initialLoading=false;this.publishHome()}
    }).catch(() => { if(this.home===audio){this.homeStarted=false;this.initialLoading=false;this.publishHome()} /* Explicit user selection may retry; no background retries. */ })
  }
  playConfirm() {
    this.playUi('confirm')
  }
  playUi(cue:UiCue) {
    if (this.disposed || this.muted) return
    let audio: HTMLAudioElement
    try { audio = this.makeAudio(this.resources.url(`sfx.ui.${cue}.candidate-01`)) } catch { return }
    if (this.confirmation) { this.confirmation.pause(); this.confirmation.removeAttribute('src'); this.confirmation.load() }
    this.confirmation = audio
    // Short cues start at full configured SFX gain; a BGM fade would swallow them.
    audio.volume = this.gain()*this.levels.sfxVolume/100
    audio.muted = this.muted
    audio.loop = false
    void audio.play().then(() => {
      if (this.disposed || this.confirmation !== audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
    }).catch(() => { if (this.confirmation === audio) this.confirmation = null })
  }
  dispose() {
    this.pauseHome()
    this.disposed = true
    this.musicGeneration++;this.release(this.pendingHome);this.pendingHome=null;this.release(this.retiringHome);this.retiringHome=null
    this.stopBrand()
    clearInterval(this.fade)
    this.release(this.home);this.home=null;this.publishHome();this.homeListeners.clear()
    if (this.confirmation) { this.confirmation.pause(); this.confirmation.removeAttribute('src'); this.confirmation.load(); this.confirmation = null }
  }
}
