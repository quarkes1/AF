import { describe, expect, it, vi } from 'vitest'
import { StartupController, chooseStartupVariant } from '../../src/renderer/features/startup/controller'

function setup(prepare = Promise.resolve(), muted = false) {
  vi.useFakeTimers()
  const audio = { playBrand: vi.fn(), stopBrand: vi.fn(), startHome: vi.fn(), playConfirm: vi.fn(), setMuted: vi.fn(), dispose: vi.fn() }
  const controller = new StartupController({ prepare: () => prepare, audio, random: () => 0.7, muted, reducedMotion: false })
  return { controller, audio }
}

describe('one startup lifecycle', () => {
  it('selects the two recordings with the exact half boundary', () => {
    expect(chooseStartupVariant(0)).toBe('brand.startup.variant-01')
    expect(chooseStartupVariant(0.49999)).toBe('brand.startup.variant-01')
    expect(chooseStartupVariant(0.5)).toBe('brand.startup.variant-02')
    expect(chooseStartupVariant(0.99999)).toBe('brand.startup.variant-02')
  })
  it('draws once, plays once and hands over once, even after repeated start/skip', async () => {
    const { controller, audio } = setup()
    controller.start(); controller.start()
    await vi.advanceTimersByTimeAsync(450)
    expect(controller.getSnapshot().phase).toBe('logo')
    expect(audio.playBrand).toHaveBeenCalledExactlyOnceWith('brand.startup.variant-02')
    controller.skip(); controller.skip()
    await vi.advanceTimersByTimeAsync(400)
    expect(controller.getSnapshot().phase).toBe('waiting')
    expect(audio.startHome).toHaveBeenCalledTimes(1)
    controller.enterHome(); controller.enterHome(); await vi.advanceTimersByTimeAsync(1999)
    expect(controller.getSnapshot().phase).toBe('enteringHome')
    expect(audio.playConfirm).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(controller.getSnapshot().phase).toBe('home')
    expect(audio.startHome).toHaveBeenCalledTimes(1)
    controller.dispose(); vi.useRealTimers()
  })
  it('holds the logo before normal exit and then stops its speech', async () => {
    const { controller, audio } = setup(); controller.start()
    await vi.advanceTimersByTimeAsync(3449)
    expect(controller.getSnapshot().phase).toBe('logo')
    await vi.advanceTimersByTimeAsync(1)
    expect(controller.getSnapshot().phase).toBe('fadingOut')
    expect(audio.stopBrand).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    expect(controller.getSnapshot().phase).toBe('waiting')
    controller.dispose(); vi.useRealTimers()
  })
  it('retains an early skip without entering an unprepared home or starting late speech', async () => {
    let resolve!: () => void
    const { controller, audio } = setup(new Promise<void>(r => { resolve = r }))
    controller.start(); controller.skip()
    await vi.advanceTimersByTimeAsync(100)
    expect(controller.getSnapshot().phase).toBe('black')
    expect(controller.getSnapshot().brandVisible).toBe(false)
    expect(audio.playBrand).not.toHaveBeenCalled()
    resolve(); await vi.advanceTimersByTimeAsync(400)
    expect(controller.getSnapshot().phase).toBe('waiting')
    expect(audio.playBrand).not.toHaveBeenCalled()
    controller.dispose(); vi.useRealTimers()
  })
  it('reaches the title screen after readiness fails or times out, without fake progress', async () => {
    const { controller } = setup(new Promise(() => {})); controller.start(); controller.skip()
    await vi.advanceTimersByTimeAsync(5400)
    expect(controller.getSnapshot().phase).toBe('waiting')
    expect(controller.getSnapshot().assetWarning).toBeTruthy()
    expect(controller.getSnapshot()).not.toHaveProperty('percent')
    controller.dispose(); vi.useRealTimers()
  })
  it('stays at the title screen until a new input and never restarts its BGM on entry', async () => {
    const {controller,audio}=setup()
    controller.start();await vi.advanceTimersByTimeAsync(3850)
    expect(controller.getSnapshot().phase).toBe('waiting')
    expect(audio.startHome).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60000)
    expect(controller.getSnapshot().phase).toBe('waiting')
    controller.enterHome();controller.enterHome();await vi.advanceTimersByTimeAsync(2000)
    expect(controller.getSnapshot().phase).toBe('home')
    expect(audio.startHome).toHaveBeenCalledTimes(1)
    controller.dispose();vi.useRealTimers()
  })
  it('never plays startup speech when launch was muted, nor replays it after unmute', async () => {
    const { controller, audio } = setup(Promise.resolve(), true); controller.start()
    await vi.advanceTimersByTimeAsync(450)
    expect(audio.playBrand).not.toHaveBeenCalled()
    controller.setMuted(false)
    expect(audio.playBrand).not.toHaveBeenCalled()
    controller.dispose(); vi.useRealTimers()
  })
  it('does not allow audio failure to reject startup', async () => {
    const { controller, audio } = setup(); audio.playBrand.mockImplementation(() => { throw new Error('missing file') })
    controller.start(); await vi.advanceTimersByTimeAsync(3850)
    expect(controller.getSnapshot().phase).toBe('waiting')
    controller.dispose(); vi.useRealTimers()
  })
  it('ignores late readiness after disposal and removes all timers', async () => {
    let resolve!: () => void
    const { controller, audio } = setup(new Promise<void>(r => { resolve = r }));controller.start();controller.dispose()
    resolve();await vi.advanceTimersByTimeAsync(10000)
    expect(audio.playBrand).not.toHaveBeenCalled();expect(audio.startHome).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0);vi.useRealTimers()
  })
  it('uses a short fade with reduced motion without changing recording selection', async () => {
    vi.useFakeTimers()
    const audio = { playBrand: vi.fn(), stopBrand: vi.fn(), startHome: vi.fn(), playConfirm: vi.fn(), setMuted: vi.fn(), dispose: vi.fn() }
    const c = new StartupController({prepare: () => Promise.resolve(), audio, random: () => .1, muted: false, reducedMotion: true})
    c.start();await vi.advanceTimersByTimeAsync(450);c.skip();await vi.advanceTimersByTimeAsync(120)
    expect(c.getSnapshot().phase).toBe('waiting');expect(audio.playBrand).toHaveBeenCalledExactlyOnceWith('brand.startup.variant-01')
    c.dispose();vi.useRealTimers()
  })
})
