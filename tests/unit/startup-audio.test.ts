import { describe, expect, it, vi } from 'vitest'
import { StartupAudioBus } from '../../src/renderer/audio/startup-audio'
import { createResourceCatalog } from '../../src/renderer/app/resources'

function setup() {
  const resources = createResourceCatalog([
    {id:'brand.startup.variant-01',file:'brand/one.mp3',status:'approved'},
    {id:'brand.startup.variant-02',file:'brand/two.mp3',status:'approved'},
    {id:'sfx.ui.confirm.candidate-01',file:'audio/sfx/ui-confirm.ogg',status:'approved'},
    {id:'sfx.ui.press.candidate-01',file:'audio/sfx/ui-press.ogg',status:'approved'},
    {id:'sfx.ui.back.candidate-01',file:'audio/sfx/ui-back.ogg',status:'approved'},
    {id:'bgm.home.suno-01',file:'bgm/home.mp3',status:'approved'},
    {id:'bgm.home.suno-02',file:'bgm/home-two.mp3',status:'approved'},
  ], 'http://localhost/')
  const media: Array<ReturnType<typeof element>> = []
  function element(url: string) {
    let resolve!: () => void
    let reject!: (error: Error) => void
    const result = new Promise<void>((r,j) => { resolve=r;reject=j })
    const audio={src:url,volume:1,muted:false,loop:false,paused:true,currentTime:0,duration:120,play:vi.fn(()=>{audio.paused=false;return result}),pause:vi.fn(()=>{audio.paused=true}),removeAttribute:vi.fn(),load:vi.fn(),resolve,reject}
    return audio
  }
  const bus = new StartupAudioBus(resources, url => { const e=element(url);media.push(e);return e as unknown as HTMLAudioElement })
  return {bus,media}
}
describe('startup media ownership', () => {
  it('reports real playback time, pauses and resumes the same element, and seeks without playing',async()=>{
    const {bus,media}=setup();bus.startHome();media[0].resolve();await Promise.resolve()
    expect(bus.getHomePlayback()).toMatchObject({playing:true,duration:120,currentTime:0})
    expect(await bus.toggleHome()).toBe(true);expect(bus.getHomePlayback().playing).toBe(false)
    expect(bus.seekHome(999)).toBe(true);expect(media[0].currentTime).toBe(120);expect(media[0].paused).toBe(true)
    bus.seekHome(25);expect(await bus.toggleHome()).toBe(true);expect(media).toHaveLength(1);expect(media[0].currentTime).toBe(25)
    expect(bus.seekHome(NaN)).toBe(false);bus.dispose()
  })
  it('pausing while a replacement is pending cancels it and prevents late playback revival',async()=>{
    const {bus,media}=setup();bus.startHome();media[0].resolve();await Promise.resolve()
    const pending=bus.switchHome('bgm.home.suno-02');expect(bus.getHomePlayback().loading).toBe(true)
    await bus.toggleHome();media[1].resolve();expect(await pending).toBe(false)
    expect(bus.getHomePlayback()).toMatchObject({playing:false,loading:false,id:'bgm.home.suno-01'})
    expect(media[0].paused).toBe(true);expect(media[1].paused).toBe(true);bus.dispose()
  })
  it('allows an explicit retry of the selected song after initial autoplay fails',async()=>{
    const {bus,media}=setup();bus.startHome();media[0].reject(Error('blocked'));await Promise.resolve();await Promise.resolve()
    const retry=bus.switchHome('bgm.home.suno-01');expect(media).toHaveLength(2)
    media[1].resolve();expect(await retry).toBe(true);bus.dispose()
  })
  it('keeps the current BGM until a replacement starts, loops it and ignores repeated selection',async()=>{
    const {bus,media}=setup();bus.startHome();media[0].resolve();await Promise.resolve()
    const pending=bus.switchHome('bgm.home.suno-02');expect(media[0].pause).not.toHaveBeenCalled()
    media[1].resolve();expect(await pending).toBe(true);expect(media[1].loop).toBe(true)
    expect(await bus.switchHome('bgm.home.suno-02')).toBe(true);expect(media).toHaveLength(2);bus.dispose()
  })
  it('preserves the old BGM on failure and cancels stale replacements and disposed requests',async()=>{
    const {bus,media}=setup();bus.startHome();media[0].resolve();await Promise.resolve()
    const failed=bus.switchHome('bgm.home.suno-02');media[1].reject(Error('decode failed'));expect(await failed).toBe(false);expect(media[0].pause).not.toHaveBeenCalled()
    const stale=bus.switchHome('bgm.home.suno-02');expect(await bus.switchHome('bgm.home.suno-01')).toBe(true);media[2].resolve();expect(await stale).toBe(false)
    const disposed=bus.switchHome('bgm.home.suno-02');bus.dispose();media[3].resolve();expect(await disposed).toBe(false);expect(media[3].pause).toHaveBeenCalled()
  })
  it('updates live gains and unfocused attenuation without replacing or replaying BGM',()=>{
    const {bus,media}=setup();bus.startHome();bus.playUi('press')
    bus.configure({masterVolume:50,bgmVolume:40,sfxVolume:80,attenuateOnBlur:true});expect(media[1].volume).toBeCloseTo(.4)
    bus.setFocused(false);expect(media[1].volume).toBeCloseTo(.1)
    bus.setFocused(true);expect(media[1].volume).toBeCloseTo(.4)
    expect(media).toHaveLength(2);expect(media[0].play).toHaveBeenCalledTimes(1);bus.dispose()
  })
  it('loops the full home track without creating a new player on repeated start',()=>{
    const {bus,media}=setup();bus.startHome();bus.startHome()
    expect(media).toHaveLength(1);expect(media[0].loop).toBe(true)
    bus.dispose();expect(media[0].pause).toHaveBeenCalled()
  })
  it('plays approved UI cues once, stops replaced cues and remains silent when muted or disposed',async()=>{
    const {bus,media}=setup()
    bus.playUi('press');expect(media[0].src).toContain('ui-press.ogg')
    expect(media[0].play).toHaveBeenCalledTimes(1);expect(media[0].volume).toBeCloseTo(.42)
    bus.playUi('back');expect(media[0].pause).toHaveBeenCalled();expect(media[1].src).toContain('ui-back.ogg')
    media[0].resolve();await Promise.resolve();expect(media[0].pause).toHaveBeenCalledTimes(2)
    bus.setMuted(true);bus.playUi('press');expect(media).toHaveLength(2)
    bus.dispose();bus.playUi('back');expect(media).toHaveLength(2)
  })
  it('plays confirmation at SFX volume without a fade, respects mute and cancels pending play on disposal', async () => {
    const {bus,media}=setup()
    bus.setMuted(true);bus.playConfirm();expect(media).toHaveLength(0)
    bus.setMuted(false);bus.playConfirm()
    expect(media[0].src).toContain('ui-confirm.ogg')
    expect(media[0].volume).toBeCloseTo(.42);expect(media[0].loop).toBe(false)
    bus.setMuted(true);expect(media[0].muted).toBe(true)
    bus.dispose();media[0].resolve();await Promise.resolve()
    expect(media[0].pause).toHaveBeenCalled()
    expect(media[0].removeAttribute).toHaveBeenCalledWith('src')
  })
  it('stops a pending brand play again if its promise resolves after skip', async () => {
    const {bus,media}=setup();bus.playBrand('brand.startup.variant-01');bus.stopBrand()
    media[0].resolve();await Promise.resolve()
    expect(media[0].pause).toHaveBeenCalledTimes(2)
    expect(media[0].removeAttribute).toHaveBeenCalledWith('src');bus.dispose()
  })
  it('does not create a later speech element after a muted launch', () => {
    const {bus,media}=setup();bus.setMuted(true);bus.playBrand('brand.startup.variant-01')
    expect(media).toHaveLength(0);bus.dispose()
  })
  it('does not retry blocked autoplay later or duplicate the home track', async () => {
    const {bus,media}=setup();bus.startHome();media[0].reject(new Error('autoplay denied'));await Promise.resolve()
    bus.startHome();expect(media).toHaveLength(1);expect(media[0].play).toHaveBeenCalledTimes(1);bus.dispose()
  })
  it('mutes live speech and BGM immediately and disposes pending fade', () => {
    vi.useFakeTimers()
    const {bus,media}=setup();bus.playBrand('brand.startup.variant-01');bus.startHome();bus.setMuted(true)
    expect(media.every(e=>e.muted)).toBe(true);bus.dispose();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers()
  })
})
