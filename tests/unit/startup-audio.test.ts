import { describe, expect, it, vi } from 'vitest'
import { StartupAudioBus } from '../../src/renderer/audio/startup-audio'
import { createResourceCatalog } from '../../src/renderer/app/resources'

function setup() {
  const resources = createResourceCatalog([
    {id:'brand.startup.variant-01',file:'brand/one.mp3',status:'approved'},
    {id:'brand.startup.variant-02',file:'brand/two.mp3',status:'approved'},
    {id:'sfx.ui.confirm.candidate-01',file:'audio/sfx/ui-confirm.ogg',status:'approved'},
    {id:'bgm.home.suno-01',file:'bgm/home.mp3',status:'approved'},
  ], 'http://localhost/')
  const media: Array<ReturnType<typeof element>> = []
  function element(url: string) {
    let resolve!: () => void
    let reject!: (error: Error) => void
    const result = new Promise<void>((r,j) => { resolve=r;reject=j })
    return {src:url, volume:1, muted:false, loop:false, play:vi.fn(() => result), pause:vi.fn(), removeAttribute:vi.fn(), load:vi.fn(), resolve, reject}
  }
  const bus = new StartupAudioBus(resources, url => { const e=element(url);media.push(e);return e as unknown as HTMLAudioElement })
  return {bus,media}
}
describe('startup media ownership', () => {
  it('plays confirmation at SFX volume without a fade, respects mute and cancels pending play on disposal', async () => {
    const {bus,media}=setup()
    bus.setMuted(true);bus.playConfirm();expect(media).toHaveLength(0)
    bus.setMuted(false);bus.playConfirm()
    expect(media[0].src).toContain('ui-confirm.ogg')
    expect(media[0].volume).toBeCloseTo(.3);expect(media[0].loop).toBe(false)
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
