import { useEffect, useSyncExternalStore, type CSSProperties } from 'react'
import type { ResourceCatalog } from './resources'
import { writePreviewPreferences } from './preview-preferences'
import { Splash } from '../features/startup/Splash'
import type { StartupController } from '../features/startup/controller'
import { Home } from '../pages/home/Home'
import { shouldEnterFromTitle, shouldSkipStartup } from '../features/startup/keyboard'
import { TitleScreen } from '../features/startup/TitleScreen'
import { STARTUP_TIMINGS, TITLE_TO_HOME_MS } from '../features/startup/timings'

const startupStyle = {
  '--startup-logo-fade-in': `${STARTUP_TIMINGS.logoFadeIn}ms`,
  '--startup-logo-fade-out': `${STARTUP_TIMINGS.logoFadeOut}ms`,
  '--title-fade-out': `${STARTUP_TIMINGS.titleFadeOut}ms`,
  '--title-to-home': `${TITLE_TO_HOME_MS}ms`,
} as CSSProperties

export function App({ controller, resources }: { controller: StartupController; resources: ResourceCatalog }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const onMute = () => {
    const value = { muted: !state.muted, reducedMotion: state.reducedMotion }
    controller.setMuted(value.muted); writePreviewPreferences(value)
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
  return <div className="app" data-motion={state.reducedMotion ? 'reduced' : 'full'} style={startupStyle}>
    {['enteringHome','home'].includes(state.phase) && <Home entryFromTitle transitioning={state.phase === 'enteringHome'} reducedMotion={state.reducedMotion} resources={resources} assetWarning={state.assetWarning} muted={state.muted} onMute={onMute} />}
    {['waiting','enteringHome'].includes(state.phase) && <TitleScreen resources={resources} reducedMotion={state.reducedMotion} entering={state.phase==='enteringHome'} muted={state.muted} onMute={onMute} onEnter={() => controller.enterHome()} />}
    {['black','logo','fadingOut'].includes(state.phase) && <Splash state={state} controller={controller} resources={resources} onMute={onMute} />}
  </div>
}
