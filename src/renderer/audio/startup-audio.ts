import type { ResourceCatalog } from '../app/resources'
import type { BrandVariant, StartupAudio } from '../features/startup/controller'

/** Owns media independently of components so late play() resolutions cannot revive old audio. */
export class StartupAudioBus implements StartupAudio {
  private brand: HTMLAudioElement | null = null
  private home: HTMLAudioElement | null = null
  private confirmation: HTMLAudioElement | null = null
  private muted = false
  private disposed = false
  private fade?: ReturnType<typeof setInterval>
  private generation = 0
  constructor(private resources: ResourceCatalog, private makeAudio = (url: string) => new Audio(url)) {}
  setMuted(muted: boolean) {
    this.muted = muted
    if (this.brand) this.brand.muted = muted
    if (this.home) this.home.muted = muted
    if (this.confirmation) this.confirmation.muted = muted
  }
  playBrand(id: BrandVariant) {
    if (this.disposed || this.muted) return
    this.stopBrand()
    const generation = this.generation
    let audio: HTMLAudioElement
    try { audio = this.makeAudio(this.resources.url(id)) } catch { return }
    this.brand = audio
    audio.volume = .6 * .5
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
    try { audio = this.makeAudio(this.resources.url('bgm.home.suno-01')) } catch { return }
    this.home = audio
    audio.volume = 0
    audio.muted = this.muted
    // No custom seamless-loop points have been approved; play the full recording.
    audio.loop = false
    const started = performance.now()
    this.fade = setInterval(() => {
      audio.volume = .6 * .35 * Math.min(1, (performance.now() - started) / 800)
      if (performance.now() - started >= 800) { clearInterval(this.fade); this.fade = undefined }
    }, 16)
    void audio.play().then(() => {
      if (this.disposed || this.home !== audio) audio.pause()
    }).catch(() => { /* Browser preview may deny autoplay. Never retry late. */ })
  }
  playConfirm() {
    if (this.disposed || this.muted) return
    let audio: HTMLAudioElement
    try { audio = this.makeAudio(this.resources.url('sfx.ui.confirm.candidate-01')) } catch { return }
    if (this.confirmation) { this.confirmation.pause(); this.confirmation.removeAttribute('src'); this.confirmation.load() }
    this.confirmation = audio
    // Short cues start at full configured SFX gain; a BGM fade would swallow them.
    audio.volume = .6 * .5
    audio.muted = this.muted
    audio.loop = false
    void audio.play().then(() => {
      if (this.disposed || this.confirmation !== audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
    }).catch(() => { if (this.confirmation === audio) this.confirmation = null })
  }
  dispose() {
    this.disposed = true
    this.stopBrand()
    clearInterval(this.fade)
    if (this.home) { this.home.pause(); this.home.removeAttribute('src'); this.home.load(); this.home = null }
    if (this.confirmation) { this.confirmation.pause(); this.confirmation.removeAttribute('src'); this.confirmation.load(); this.confirmation = null }
  }
}
