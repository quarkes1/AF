import {MaterialBatchSettings} from './MaterialBatchSettings'
import type {BackendClient} from '../materials/backend-client'
import {graphemeCount} from '../../../shared/graphemes'
import {useEffect,useRef,useState,type ReactNode,type MouseEvent} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {focusWhenVisible} from '../../components/focus'
import {DEFAULT_PREFERENCES,SETTINGS_SECTIONS,type SettingsPreferences,type SettingsSection} from './model'
import './settings.css'
import {ProviderSettings} from './ProviderSettings'

function Row({title,description,children,scope='全局'}:{title:string;description?:string;children:ReactNode;scope?:string}){
  return <div className="settings-row"><div className="settings-row__label"><h3>{title}<small>{scope}</small></h3>{description&&<p>{description}</p>}</div><div className="settings-row__control">{children}</div></div>
}
function Toggle({label,value,onChange,disabled=false,silent=false}:{label:string;value:boolean;onChange?:(value:boolean)=>void;disabled?:boolean;silent?:boolean}){
  return <label className="settings-toggle"><input type="checkbox" aria-label={label} checked={value} disabled={disabled} data-ui-sound={silent?'none':undefined} onChange={event=>onChange?.(event.target.checked)}/><span aria-hidden="true"/><b>{value?'开启':'关闭'}</b></label>
}
function Unavailable({children}:{children:ReactNode}){return <p className="settings-unavailable"><span>未接入</span>{children}</p>}
function Volume({name,value,onChange}:{name:string;value:number;onChange:(value:number)=>void}){
  return <label className="settings-volume"><input type="range" min="0" max="100" step="1" aria-label={name} aria-valuetext={`${value}%`} value={value} onChange={event=>onChange(Number(event.target.value))}/><output>{value}%</output></label>
}
interface Props{materialClient?:BackendClient|null;open:boolean;resources:ResourceCatalog;preferences:SettingsPreferences;onChange:(patch:Partial<SettingsPreferences>)=>void;onBack:()=>void;onCompanions:()=>void;onSaves:()=>void;onPreviewSound:()=>void;companionName:string;storageWarning:string|null}
export function SettingsScreen({materialClient=null,open,resources,preferences:p,onChange,onBack,onCompanions,onSaves,onPreviewSound,companionName,storageWarning}:Props){
  const root=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null),back=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLElement|null>(null),composing=useRef(false)
  const [active,setActive]=useState<SettingsSection>('display'),[name,setName]=useState(p.userName),[nameError,setNameError]=useState<string|null>(null)
  useEffect(()=>{setName(p.userName);setNameError(null)},[open,p.userName])
  useEffect(()=>{
    if(!open)return
    return focusWhenVisible(()=>returnFocus.current?.isConnected?returnFocus.current:back.current,()=>{returnFocus.current=null})
  },[open])
  const spy=()=>{
    const box=scroll.current;if(!box)return
    if(box.scrollTop+box.clientHeight>=box.scrollHeight-3){setActive('help');return}
    const threshold=box.getBoundingClientRect().top+45
    let current:SettingsSection='display'
    for(const [id] of SETTINGS_SECTIONS){const section=box.querySelector<HTMLElement>(`#settings-${id}`);if(section&&section.getBoundingClientRect().top<=threshold)current=id}
    setActive(current)
  }
  useEffect(()=>{if(!open||!scroll.current)return;const observer=new ResizeObserver(spy);observer.observe(scroll.current);const content=scroll.current.firstElementChild;if(content)observer.observe(content);spy();return()=>observer.disconnect()},[open])
  useEffect(()=>{if(!open)return;root.current?.querySelector<HTMLElement>(`[aria-controls="settings-${active}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})},[active,open])
  const jump=(id:SettingsSection)=>{const box=scroll.current,target=box?.querySelector<HTMLElement>(`#settings-${id}`);if(!box||!target)return;box.scrollTo({top:target.offsetTop,behavior:p.reducedMotion?'instant':'smooth'});setActive(id)}
  useEffect(()=>{
    if(!open)return
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||composing.current||event.keyCode===229)return
      const details=(event.target as HTMLElement).closest<HTMLDetailsElement>('details[open]');if(details){event.preventDefault();details.open=false;details.querySelector('summary')?.focus();return}
      event.preventDefault();onBack()
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[open,onBack])
  const commitName=()=>{const value=name.trim();if(!value||graphemeCount(value)>32){setNameError('姓名需为 1–32 个字，当前全局姓名未改变。');return}setNameError(null);if(value!==p.userName)onChange({userName:value})}
  const child=(event:MouseEvent<HTMLButtonElement>,action:()=>void)=>{returnFocus.current=event.currentTarget;action()}
  const heading=(id:SettingsSection,description:string,restore?:()=>void)=><header className="settings-section__heading"><div><h2>{SETTINGS_SECTIONS.find(([key])=>key===id)?.[1]}</h2><p>{description}</p></div>{restore&&<button className="settings-text-button" onClick={restore}>恢复本组默认</button>}</header>
  return <section ref={root} className="settings-screen" data-open={open} inert={!open} aria-hidden={!open} aria-label="设置" data-testid="settings-screen" onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}}>
    <img className="settings-screen__background" src={resources.url('background.library-hall-day')} alt=""/><div className="settings-screen__shade"/>
    <img className="settings-screen__brand" src={resources.url('brand.logo.inverse')} alt="AF"/>
    <header className="settings-screen__header"><button ref={back} className="quiet-button" data-ui-sound="back" aria-label="返回首页" onClick={onBack}><Icon name="arrow-left" resources={resources}/></button><h1>设置</h1><span>偏好与连接</span></header>
    <nav className="settings-index" aria-label="设置分类" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=Array.from(event.currentTarget.querySelectorAll('button')),index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;buttons[next].focus();buttons[next].scrollIntoView({block:'nearest',inline:'nearest'})}}>
      {SETTINGS_SECTIONS.map(([id,label])=><button key={id} aria-current={active===id?'location':undefined} aria-controls={`settings-${id}`} onClick={()=>jump(id)}>{label}</button>)}
    </nav>
    <div className="settings-scroll" ref={scroll} onScroll={spy} tabIndex={0} aria-label="全部设置内容"><div className="settings-content">
      <p className="settings-preview-note">本地偏好即时应用。标记“未接入”的服务暂不可用，不会发送数据或产生费用。</p>
      {storageWarning&&<p className="settings-error" role="alert">{storageWarning}</p>}
      <section id="settings-display" className="settings-section" aria-labelledby="settings-display-title">
        <div id="settings-display-title">{heading('display','调整阅读节奏、画面与声音。',()=>onChange({muted:false,reducedMotion:false,uiScale:100,typewriter:true,subtitleSpeed:4,masterVolume:60,bgmVolume:35,sfxVolume:70,attenuateOnBlur:false}))}</div>
        <Row title="界面字号" description="调整文字大小，保留页面布局与操作入口。"><select aria-label="界面字号" value={p.uiScale} onChange={event=>onChange({uiScale:Number(event.target.value) as SettingsPreferences['uiScale']})}>{[100,125,150].map(value=><option key={value} value={value}>{value}%</option>)}</select></Row>
        <Row title="动画强度" description="默认使用完整动画；可手动选择简化模式，不改变字幕速度。"><select aria-label="动画强度" value={p.reducedMotion?'reduced':'full'} onChange={event=>onChange({reducedMotion:event.target.value==='reduced'})}><option value="full">完整动画</option><option value="reduced">简化动画</option></select></Row>
        <Row title="逐字字幕" description="对白按口述节奏呈现；关闭后整页显示，旁白和公式始终完整显示。"><Toggle label="逐字字幕" value={p.typewriter} onChange={value=>onChange({typewriter:value})}/></Row>
        <Row title="字幕速度" description="空格先补全当前对白，再次按下推进下一页。"><label className="settings-volume"><input aria-label="字幕速度" type="range" min="3" max="5" step=".5" disabled={!p.typewriter} value={p.subtitleSpeed} onChange={event=>onChange({subtitleSpeed:Number(event.target.value)})}/><output>{p.subtitleSpeed} 字/秒</output></label></Row>
        <Row title="静音" description="关闭所有声音，保留原有音量设置。"><Toggle label="静音" silent value={p.muted} onChange={value=>onChange({muted:value})}/></Row>
        <Row title="主音量"><Volume name="主音量" value={p.masterVolume} onChange={value=>onChange({masterVolume:value})}/></Row>
        <Row title="背景音乐" description="整曲循环，进入首页和切换页面时连续播放。"><Volume name="背景音乐音量" value={p.bgmVolume} onChange={value=>onChange({bgmVolume:value})}/></Row>
        <Row title="操作音效" description="按钮操作与手动对白推进发声；悬停、逐字字幕不发声。"><Volume name="操作音效音量" value={p.sfxVolume} onChange={value=>onChange({sfxVolume:value})}/><button className="settings-text-button" data-ui-sound="none" disabled={p.muted||!p.masterVolume||!p.sfxVolume} onClick={onPreviewSound}>试听操作音</button></Row>
        <Row title="失焦时降低音量" description="切到其他窗口时降至当前音量的 25%，返回后恢复。"><Toggle label="失焦时降低音量" value={p.attenuateOnBlur} onChange={value=>onChange({attenuateOnBlur:value})}/></Row>
        <Row title="窗口与全屏" description="按 F11 切换窗口／全屏。此页面不会改变窗口尺寸。"><kbd>F11</kbd></Row>
      </section>
      <section id="settings-companion" className="settings-section" aria-label="搭档与互动">
        {heading('companion','全局姓名与搭档管理；故事内的互动设置单独标注作用域。',()=>onChange({userName:DEFAULT_PREFERENCES.userName}))}
        <Row title="用户姓名" description="默认为“我”；身份等效不沿用原作主角姓名。"><input aria-label="用户姓名" maxLength={128} value={name} onChange={event=>setName(event.target.value)} onBlur={commitName} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&!composing.current){event.preventDefault();commitName()}}}/><small>姓名牌：{p.userName}</small>{nameError&&<p className="settings-error" role="alert">{nameError}</p>}</Row>
        <Row title="当前搭档" description="人格、身份、立绘及标签在搭档档案中编辑。"><strong>{companionName}</strong><button className="save-secondary" onClick={event=>child(event,onCompanions)}>打开搭档档案 <span aria-hidden="true">→</span></button></Row>
        <Unavailable>主动互动服务尚未接入，当前不会自动搭话或读取现实信息。</Unavailable>
        <Row title="主动搭话" scope="当前存档" description="学习、答题、输入和设置期间不抢屏。"><Toggle label="主动搭话" value={false} disabled/></Row>
        <Row title="安静时段" scope="当前存档"><div className="settings-inline"><input type="time" aria-label="安静开始时间" disabled/><span>至</span><input type="time" aria-label="安静结束时间" disabled/></div></Row>
        <Row title="冷却与每日上限" scope="当前存档"><div className="settings-inline"><input type="number" placeholder="冷却分钟" aria-label="主动搭话冷却分钟" disabled/><input type="number" placeholder="每日次数" aria-label="主动搭话每日上限" disabled/></div></Row>
        <Row title="后台运行" description="完全退出应用后不运行；常驻能力未接入。"><Toggle label="后台运行" value={false} disabled/></Row>
      </section>
      <section id="settings-sources" className="settings-section" aria-label="资料与来源">
        {heading('sources','管理资料入口与外部信息的访问范围。')}<MaterialBatchSettings client={materialClient} open={open}/>
        <Unavailable>本地资料的导入、解析和整理可在资料管理中操作。账号连接尚未接入，未授权来源不会被读取。</Unavailable>
        <Row title="资料文件夹" description="支持 doc/docx、ppt/pptx、PDF、Markdown 和 TXT。"><input aria-label="资料文件夹" placeholder="尚未关联文件夹" disabled/><button className="save-secondary" disabled>选择文件夹</button></Row>
        <Row title="自动检查资料更新" description="仅检查已授权的文件夹。"><Toggle label="自动检查资料更新" value={false} disabled/></Row>
        <Row title="联网检索" description="查找补充资料前明确发送范围和来源。"><Toggle label="联网检索" value={false} disabled/></Row>
        <Row title="外部平台" description="读取通知、课件与发送消息分别授权，不默认开放。"><div className="settings-service-list"><span>QQ · 未连接</span><span>B站 · 未连接</span><span>微信 · 适配研究中</span></div></Row>
        <details className="settings-details"><summary>来源授权说明</summary><p>资料、网页和消息不等同于应用指令。连接能力启用后，用户应能查看允许读取的范围，并单独控制搭档获知信息及向外发送消息的权限。</p></details>
      </section>
      <section id="settings-model" className="settings-section" aria-label="模型与预算">
        {heading('model','配置模型服务与消耗边界；本地存储不等于本地推理。')}
        {typeof window!=='undefined'&&window.afMaterials?<ProviderSettings/>:<>
        <Unavailable>浏览器预览不提供模型调用与安全凭据保管，请使用桌面应用。</Unavailable>
        <Row title="模型服务"><select aria-label="模型服务" disabled defaultValue="deepseek"><option value="deepseek">DeepSeek</option><option value="custom">其他兼容服务</option></select></Row>
        <Row title="API Key" description="正式接入后由安全凭据服务保管，不写入日志或导出包。"><input type="password" aria-label="API Key" placeholder="安全凭据服务未接入" autoComplete="off" disabled/></Row>
        <Row title="主模型" description="预设配置；连接后仍需测试实际能力。"><input aria-label="主模型" defaultValue="deepseek-flash" disabled/><button className="save-secondary" disabled>测试连接</button></Row>
        <Row title="自定义服务地址"><input aria-label="自定义服务地址" placeholder="其他服务的 Base URL" disabled/></Row>
        </>}
        <Row title="用量与预算" description="费用以实际用量或明确的估算区间显示。"><span>暂无调用记录</span><input aria-label="消耗上限" placeholder="消耗上限 · 未接入" disabled/></Row>
        <details className="settings-details"><summary>高级：扩展能力与工具权限</summary><p>MCP、Skill 和模型工具由 AF 统一管理。正式接入后可检查能力状态、启停与权限；用户无需另外安装 dsh 或独立宿主。</p><button className="save-secondary" disabled>管理扩展能力</button></details>
      </section>
      <section id="settings-data" className="settings-section" aria-label="存档与数据">
        {heading('data','存档、资料副本和缓存分别管理，保留清楚的影响范围。')}
        <Row title="存档管理" description="查看全部搭档的存档，按最后修改时间排序。"><button className="save-secondary" onClick={event=>child(event,onSaves)}>打开存档页面 <span aria-hidden="true">→</span></button></Row>
        <Unavailable>数据库、备份和磁盘容量服务尚未接入，暂不显示推测的数据位置或占用。</Unavailable>
        <Row title="数据位置与占用"><span>尚无可查询的真实存储记录</span><button className="save-secondary" disabled>打开数据目录</button></Row>
        <Row title="备份与恢复" description="恢复前保留现有数据，不以空档覆盖。"><div className="settings-inline"><button className="save-secondary" disabled>创建备份</button><button className="save-secondary" disabled>恢复备份</button></div></Row>
        <Row title="导出内容" description="源资料、共同记忆和外部消息分开选择，默认不包含凭据。"><button className="save-secondary" disabled>导出数据</button></Row>
        <details className="settings-details settings-danger"><summary>清理与删除数据</summary><p>分别清理课程索引、受管副本或来源缓存；普通移除不会默认删除原始课件。真实清理服务尚未接入。</p><button className="save-secondary" disabled>查看清理范围</button></details>
      </section>
      <section id="settings-help" className="settings-section" aria-label="帮助与诊断">
        {heading('help','查看操作说明、当前能力与资源状态。')}
        <Row title="Aurora Forge"><span>前端预览 · v0.1.0</span><span className="settings-muted">完整应用功能仍在开发中</span></Row>
        <Row title="操作说明"><dl className="settings-shortcuts"><div><dt><kbd>F11</kbd></dt><dd>切换全屏</dd></div><div><dt><kbd>Esc</kbd></dt><dd>关闭当前面板或返回</dd></div><div><dt><kbd>Space</kbd></dt><dd>补全／推进对白</dd></div><div><dt><kbd>Enter</kbd> / <kbd>Shift + Enter</kbd></dt><dd>发送／换行，输入法组合期间不发送</dd></div></dl></Row>
        <Row title="核心资源"><div className="settings-service-list"><span>{resources.has('character.af-guide.01-neutral')?'默认立绘已登记':'默认立绘不可用'}</span><span>{resources.has('bgm.home.suno-01')?'主页 BGM 已登记':'主页 BGM 不可用'}</span><span>{resources.has('sfx.ui.press.candidate-01')?'操作音效已登记':'操作音效不可用'}</span></div></Row>
        <Row title="诊断日志" description="正式接入后只导出脱敏信息，不包含 API Key、私聊或课件原文。"><button className="save-secondary" disabled>导出诊断信息</button></Row>
        <details className="settings-details"><summary>素材与开源许可</summary><p>应用代码许可不覆盖第三方字体、音乐和其他素材的单独许可。音频与资源来源已在项目清单中记录；完整许可查看器尚未接入。</p></details>
      </section>
      <footer className="settings-end">已到达全部设置末尾</footer>
    </div></div>
  </section>
}
