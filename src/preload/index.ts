import {contextBridge,ipcRenderer} from 'electron'
import type {BackendRequest} from '../shared/contracts/materials'
import type {StoryRequest} from '../shared/contracts/story'
contextBridge.exposeInMainWorld('afMaterials',Object.freeze({request:(request:BackendRequest)=>ipcRenderer.invoke('af:materials',request)}))
contextBridge.exposeInMainWorld('afStory',Object.freeze({request:(request:StoryRequest)=>ipcRenderer.invoke('af:story',request)}))
