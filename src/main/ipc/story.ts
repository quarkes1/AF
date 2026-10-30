import {BrowserWindow,ipcMain} from 'electron'
import type {StoryStore} from '../modules/story/store'
export function installStoryIpc(store:StoryStore){
 ipcMain.handle('af:story',(event,input:unknown)=>{
  const window=BrowserWindow.fromWebContents(event.sender)
  if(!window||event.senderFrame!==event.sender.mainFrame)return{protocolVersion:1,requestId:'',ok:false,stateVersion:null,error:{code:'FORBIDDEN',message:'拒绝非主窗口请求。',retryable:false,detailsRef:null}}
  return store.request(input)
 })
 return()=>ipcMain.removeHandler('af:story')
}
