import { app, BrowserWindow, session,dialog,shell } from 'electron'
import { dirname, resolve,relative,isAbsolute,basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import appIcon from '../../../assets/brand/app-icon/aurore-256.png?asset'
import taskbarIcon from '../../../assets/brand/app-icon/aurore.ico?asset'
import {cacheTaskbarIcon,taskbarApplicationId,taskbarDetails} from './taskbar'
import {MaterialRepository} from '../modules/resources/repository'
import {ProviderProfile} from '../infrastructure/providers/profile'
import {MaterialService} from '../modules/resources/service'
import {installMaterialIpc} from '../ipc/materials'

const applicationId=taskbarApplicationId(process.env.AF_TEST_MODE==='1')
if(process.platform==='win32')app.setAppUserModelId(applicationId)

if(process.env.AF_TEST_MODE==='1'){
  const requested=process.env.AF_TEST_PROFILE
  if(requested){const path=resolve(requested),rel=relative(tmpdir(),path);if(rel.startsWith('..')||isAbsolute(rel)||!basename(path).startsWith('aurora-forge-ui-test-'))throw new Error('Invalid isolated test profile');app.setPath('userData',path)}
  else app.setPath('userData',mkdtempSync(resolve(tmpdir(),'aurora-forge-ui-test-')))
}

const here = dirname(fileURLToPath(import.meta.url))
let window: BrowserWindow | null = null
let materialService:MaterialService|undefined
let disposeMaterialIpc:(()=>void)|undefined
function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 900, useContentSize: true, minWidth: 800, minHeight: 600,
    show: false, backgroundColor: '#000000', title: 'Aurora Forge', icon: appIcon,
    webPreferences: {
      preload: resolve(here, '../preload/index.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  if(process.platform==='win32'){
    const iconPath=cacheTaskbarIcon(taskbarIcon,app.getPath('userData'))
    window.setAppDetails(taskbarDetails({executable:process.execPath,entry:app.isPackaged?undefined:app.getAppPath(),iconPath,testMode:process.env.AF_TEST_MODE==='1'}))
    window.setIcon(appIcon)
  }
  window.removeMenu()
  window.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&input.key==='F11'&&!input.isAutoRepeat&&!input.control&&!input.alt&&!input.meta){event.preventDefault();window?.setFullScreen(!window.isFullScreen())}
  })
  window.webContents.setWindowOpenHandler(({url})=>{if(['https://platform.deepseek.com/api_keys','https://www.deepseek.com/'].includes(url))void shell.openExternal(url);return{action:'deny'}})
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.on('ready-to-show', () => { if (process.env.AF_TEST_MODE !== '1') window?.show() })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(resolve(here, '../renderer/index.html'))
  window.on('closed', () => { window = null })
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus() })
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    const root=app.getPath('userData')
    const repository=new MaterialRepository(root)
    materialService=new MaterialService(repository,new ProviderProfile(root,repository.db),{parser:resolve(here,'materials-parser.js'),agent:resolve(here,'materials-agent.js'),runtime:resolve(here,'../resources/document-runtime'),skill:resolve(here,'../resources/skills/resource-ingest/1.0.0/SKILL.md')})
    disposeMaterialIpc=installMaterialIpc(materialService)
    createWindow()
  }).catch(()=>{dialog.showErrorBox('AF 资料库初始化失败','资料库或必要组件暂时无法打开。原文件未改动；请保留应用数据目录及数据库备份，修复 AF 后重试。');app.quit()})
  app.on('before-quit',()=>{materialService?.dispose();disposeMaterialIpc?.()})
  app.on('window-all-closed', () => app.quit())
}
