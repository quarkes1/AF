import { app, BrowserWindow, session } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
let window: BrowserWindow | null = null
function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 900, useContentSize: true, minWidth: 800, minHeight: 600,
    show: false, backgroundColor: '#000000', title: 'Aurora Forge',
    webPreferences: {
      preload: resolve(here, '../preload/index.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  window.removeMenu()
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
