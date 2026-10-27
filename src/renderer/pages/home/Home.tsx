import { useState } from 'react'
import type { ResourceCatalog } from '../../app/resources'
import { Icon } from '../../components/Icon'
import { useHomeParallax } from './useHomeParallax'

/** No fabricated save: this is the real empty home of the first frontend slice. */
export function Home({ resources, assetWarning, muted, onMute, entryFromTitle = false, transitioning = false, reducedMotion = false }: {
  resources: ResourceCatalog; assetWarning: string | null; muted: boolean; onMute: () => void; entryFromTitle?: boolean; transitioning?: boolean; reducedMotion?: boolean
}) {
  const [backgroundMissing, setBackgroundMissing] = useState(false)
  const [portraitMissing, setPortraitMissing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const motionRef = useHomeParallax(!transitioning && !reducedMotion)
  const unavailable = (name: string) => setNotice(`${name}将在后续界面阶段接入，当前未创建或修改任何存档。`)
  return <main ref={motionRef} className={`home${entryFromTitle ? ' home--from-title' : ''}`} inert={transitioning} data-testid="home" aria-label="Aurora Forge 首页">
    {!backgroundMissing && <img className="home__background" alt="" src={resources.url('background.library-hall-day')} onError={() => setBackgroundMissing(true)} />}
    <header className="home__header">
      <img className="home__brand" src={resources.url('brand.logo.inverse')} alt="Aurora Forge" />
      <div className="home__top-actions">
        <button className="quiet-button" onClick={onMute} aria-label={muted ? '开启声音' : '关闭声音'} aria-pressed={muted}><Icon name={muted ? 'volume-off' : 'volume'} resources={resources} /></button>
        <span className="home__header-divider" />
        <button className="quiet-button" onClick={() => unavailable('设置')}><Icon name="settings" resources={resources} />设置</button>
      </div>
    </header>
    <button className="home__portrait" aria-label="与 Aurore 聊聊" onClick={() => unavailable('首页聊天')}>
      {!portraitMissing ? <img src={resources.url('character.af-guide.01-neutral')} alt="Aurore" draggable="false" onError={() => setPortraitMissing(true)} /> : <span className="portrait-fallback">Aurore<br /><small>立绘暂不可用</small></span>}
    </button>
    <div className="home__portrait-hint"><Icon name="mouse" resources={resources} />点击搭档，与她聊聊 <span>›</span></div>
    <section className="home__navigation" aria-label="主要功能">
      <button className="home__save panel-button" onClick={() => unavailable('存档管理')}><Icon name="folder" resources={resources} /><strong>存档</strong><span>尚无故事存档</span><span>›</span></button>
      <button className="home__story" onClick={() => unavailable('新故事创建')}>
        <img className="home__story-art" alt="" src={resources.url('background.campus-courtyard-day')} />
        <div className="home__story-content">
          <span className="home__short-rule" /><span className="home__story-label">STORY</span>
          <h2>开始故事 <span className="home__arrow">→</span></h2>
          <p className="home__story-chapter">全新的起点</p>
          <span className="home__short-rule home__short-rule--lower" />
          <p className="home__story-note">从一次相遇开始，<br />让日常有新的故事。</p>
        </div>
      </button>
      <div className="home__tiles">
        {[
          ['book-open', '章节学习', '回顾课程 · 提升自己'],
          ['user', '搭档档案', '关于她 · 更多的故事'],
          ['folder', '资料管理', '笔记 · 文件 · 收藏'],
        ].map(([icon, title, subtitle]) => <button key={title} className="home__tile panel-button" onClick={() => unavailable(title)}>
          <Icon name={icon} resources={resources} /><span className="home__tile-rule" />
          <strong>{title}<span>›</span></strong><small>{subtitle}</small><span className="home__tile-accent" />
        </button>)}
      </div>
    </section>
    <div className="home__greeting"><span /><p><b>Aurore</b>：今天想接着聊，还是一起看看课本？</p></div>
    {assetWarning && <div className="home__asset-warning" role="status">{assetWarning}</div>}
    {notice && <div className="home__notice" role="status"><span>{notice}</span><button className="quiet-button" onClick={() => setNotice(null)} aria-label="关闭提示">×</button></div>}
  </main>
}
