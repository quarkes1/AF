export const STARTUP_VARIANTS = ['brand.startup.variant-01', 'brand.startup.variant-02'] as const
export type BrandVariant = typeof STARTUP_VARIANTS[number]
export type UiCue='press'|'confirm'|'back'
import type {AudioPreferences} from '../../pages/settings/model'
import {EMPTY_HOME_PLAYBACK,type HomePlayback} from '../../audio/home-playback'
export type StartupPhase = 'black' | 'logo' | 'fadingOut' | 'waiting' | 'enteringHome' | 'home'
export interface StartupSnapshot {
  phase: StartupPhase
  variant: BrandVariant
  muted: boolean
  reducedMotion: boolean
  assetWarning: string | null
  brandVisible: boolean
}
export interface StartupAudio {
  playBrand(id: BrandVariant): void
  stopBrand(): void
  startHome(): void
  playConfirm(): void
  playUi(cue:UiCue):void
  setMuted(muted: boolean): void
  configure?(preferences:AudioPreferences):void
  setFocused?(focused:boolean):void
  switchHome?(id:string):Promise<boolean>
  getHomePlayback?:()=>HomePlayback
  subscribeHome?:(listener:()=>void)=>()=>void
  toggleHome?:()=>Promise<boolean>
  seekHome?:(seconds:number)=>boolean
  dispose(): void
}
interface Options {
  prepare: () => Promise<unknown>
  audio: StartupAudio
  random: () => number
  muted: boolean
  reducedMotion: boolean
}

export function chooseStartupVariant(random: number): BrandVariant {
  return STARTUP_VARIANTS[Number.isFinite(random) && random >= 0.5 ? 1 : 0]
}

/** One controller belongs to one renderer launch, not to an individual React render. */
export class StartupController {
  private state: StartupSnapshot
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private started = false
  private disposed = false
  private skipRequested = false
  private readySettled = false
  private blackElapsed = false
  private readinessTimer?: ReturnType<typeof setTimeout>

  constructor(private options: Options) {
    this.state = { phase: 'black', variant: chooseStartupVariant(options.random()), muted: options.muted,
      reducedMotion: options.reducedMotion, assetWarning: null, brandVisible: false }
    options.audio.setMuted(options.muted)
  }
  getSnapshot = () => this.state
  subscribe = (callback: () => void) => {
    this.listeners.add(callback)
    return () => { this.listeners.delete(callback) }
  }
  private update(patch: Partial<StartupSnapshot>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(callback => callback())
  }
  private later(callback: () => void, delay: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.disposed) callback() }, delay)
    this.timers.add(timer)
    return timer
  }
  start() {
    if (this.started || this.disposed) return
    this.started = true
    this.later(() => { this.blackElapsed = true; this.revealWhenReady() }, STARTUP_TIMINGS.black)
    this.readinessTimer = this.later(() => this.prepared('部分素材加载超时，将使用可用内容。'), STARTUP_TIMINGS.assetTimeout)
    Promise.resolve().then(this.options.prepare).then(
      () => this.prepared(null),
      () => this.prepared('部分素材暂不可用，仍可继续。'),
    )
  }
  private prepared(warning: string | null) {
    if (this.disposed || this.readySettled) return
    this.readySettled = true
    if (this.readinessTimer) { clearTimeout(this.readinessTimer); this.timers.delete(this.readinessTimer) }
    this.update({ assetWarning: warning })
    this.revealWhenReady()
  }
  private revealWhenReady() {
    if (this.disposed || !this.readySettled || this.state.phase !== 'black') return
    if (this.skipRequested) { this.leave(); return }
    if (!this.blackElapsed) return
    this.update({ phase: 'logo', brandVisible: true })
    if (!this.state.muted) {
      try { this.options.audio.playBrand(this.state.variant) } catch { /* Audio never blocks startup. */ }
    }
    this.later(() => this.leave(), LOGO_PRESENTATION_MS)
  }
  skip() {
    if (this.disposed || !['black', 'logo'].includes(this.state.phase)) return
    this.skipRequested = true
    if (this.readySettled) this.leave()
  }
  private leave() {
    if (this.disposed || !['black', 'logo'].includes(this.state.phase)) return
    this.options.audio.stopBrand()
    this.update({ phase: 'fadingOut' })
    this.later(() => {
      this.update({ phase: 'waiting' })
      this.options.audio.startHome()
    }, this.state.reducedMotion ? STARTUP_TIMINGS.reducedMotion : STARTUP_TIMINGS.logoFadeOut)
  }
  enterHome() {
    if (this.disposed || this.state.phase !== 'waiting') return
    this.update({ phase: 'enteringHome' })
    try { this.options.audio.playConfirm() } catch { /* An unavailable cue never blocks navigation. */ }
    this.later(() => this.update({ phase: 'home' }), this.state.reducedMotion ? STARTUP_TIMINGS.reducedMotion : TITLE_TO_HOME_MS)
  }
  setMuted(muted: boolean) {
    this.options.audio.setMuted(muted)
    this.update({ muted })
  }
  playUi(cue:UiCue='press') {
    if(this.disposed||this.state.phase!=='home')return
    try{this.options.audio.playUi(cue)}catch{/* Missing SFX never blocks the requested action. */}
  }
  setReducedMotion(reducedMotion:boolean){this.update({reducedMotion})}
  configureAudio(preferences:AudioPreferences){this.options.audio.configure?.(preferences)}
  setFocused(focused:boolean){this.options.audio.setFocused?.(focused)}
  switchHomeMusic(id:string){return this.options.audio.switchHome?.(id)??Promise.resolve(false)}
  getHomePlayback=()=>this.options.audio.getHomePlayback?.()??EMPTY_HOME_PLAYBACK
  subscribeHome=(listener:()=>void)=>this.options.audio.subscribeHome?.(listener)??(()=>{})
  toggleHomeMusic=()=>this.options.audio.toggleHome?.()??Promise.resolve(false)
  seekHomeMusic=(seconds:number)=>this.options.audio.seekHome?.(seconds)??false
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.timers.forEach(clearTimeout); this.timers.clear()
    this.options.audio.dispose(); this.listeners.clear()
  }
}
import { LOGO_PRESENTATION_MS, STARTUP_TIMINGS, TITLE_TO_HOME_MS } from './timings'
