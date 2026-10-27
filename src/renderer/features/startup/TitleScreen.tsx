import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'
import { TitleScene } from './title-scene/TitleScene'

export function TitleScreen({ resources, entering, muted, onMute, onEnter, reducedMotion=false }: {
  resources: ResourceCatalog; entering: boolean; muted: boolean; onMute: () => void; onEnter: () => void; reducedMotion?: boolean
}) {
  return <section className={`title-screen${entering ? ' title-screen--entering' : ''}`} data-testid="title-screen" aria-label="Aurora Forge 标题栏">
    <TitleScene resources={resources} reducedMotion={reducedMotion}/>
    <div className="title-screen__shade" />
    <div className="title-screen__identity">
      <img src={resources.url('brand.logo.inverse')} alt="AF" draggable="false" />
    </div>
    <button className="title-screen__enter" onClick={onEnter} disabled={entering} aria-label="进入首页">
      <span>按任意键开始</span>
    </button>
    <div className="title-screen__footer">
      <button className="quiet-button" onClick={onMute} aria-label={muted ? '开启声音' : '关闭声音'} aria-pressed={muted}>
        <Icon name={muted ? 'volume-off' : 'volume'} resources={resources} />{muted ? '声音已关闭' : '声音已开启'}
      </button>
    </div>
  </section>
}
