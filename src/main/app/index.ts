import { app, BrowserWindow, session } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import appIcon from '../../../assets/brand/app-icon/aurore-256.png?asset'
import taskbarIcon from '../../../assets/brand/app-icon/aurore.ico?asset'
import {cacheTaskbarIcon,taskbarApplicationId,taskbarDetails} from './taskbar'

const applicationId=taskbarApplicationId(process.env.AF_TEST_MODE==='1')
if(process.platform==='win32')app.setAppUserModelId(applicationId)

if(process.env.AF_TEST_MODE==='1')app.setPath('userData',mkdtempSync(resolve(tmpdir(),'aurora-forge-ui-test-')))

const here = dirname(fileURLToPath(import.meta.url))
let window: BrowserWindow | null = null
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
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
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
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
