import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'
import type { StartupController, StartupSnapshot } from './controller'

export function Splash({ state, controller, resources, onMute }: {
  state: StartupSnapshot; controller: StartupController; resources: ResourceCatalog; onMute: () => void
}) {
  return <section className={`splash splash--${state.phase}${state.brandVisible ? '' : ' splash--unrevealed'}`} aria-label="Aurora Forge 开屏" data-testid="splash" data-phase={state.phase}>
    <div className="splash__identity" aria-label="Aurora Forge">
      <img className="splash__logo" src={resources.url('brand.logo.inverse')} alt="AF" draggable="false" />
      <h1>Aurora Forge</h1>
    </div>
    <footer className="splash__footer">
      <button className="quiet-button" onClick={onMute} aria-label={state.muted ? '开启声音' : '关闭声音'} aria-pressed={state.muted}>
        <Icon name={state.muted ? 'volume-off' : 'volume'} resources={resources} />
        <span>{state.muted ? '声音已关闭' : '声音已开启'}</span>
      </button>
    </footer>
  </section>
}
