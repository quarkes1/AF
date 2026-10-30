import {contextBridge,ipcRenderer} from 'electron'
import type {BackendRequest} from '../shared/contracts/materials'
contextBridge.exposeInMainWorld('afMaterials',Object.freeze({request:(request:BackendRequest)=>ipcRenderer.invoke('af:materials',request)}))
