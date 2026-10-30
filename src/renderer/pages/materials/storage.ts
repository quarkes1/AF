import type {LibraryItem} from './model'
import {NativeMaterialStorage} from './backend-client'

// User-selected file copies only. No access to arbitrary filesystem paths.
export class LibraryStorage{
  readonly native=typeof window!=='undefined'&&window.afMaterials?new NativeMaterialStorage():null
  private database?:Promise<IDBDatabase>
  private open(){
    return this.database??=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('af.local-resource-library.v1',1)
      request.onupgradeneeded=()=>request.result.createObjectStore('items',{keyPath:'id'})
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)}
      request.onerror=()=>{this.database=undefined;reject(new Error('本地资源库暂时无法打开。'))}
      request.onblocked=()=>{this.database=undefined;reject(new Error('请关闭其他 AF 窗口后重试。'))}
    })
  }
  async all():Promise<LibraryItem[]>{
    if(this.native){
      const old=await this.legacyAll()
      for(const item of old){const migrated=await this.native.put(item);if(migrated.id!==item.id)for(const key of ['af.frontend-preview.home-background.v1','af.frontend-preview.home-music.v1'])try{if(localStorage.getItem(key)===item.id)localStorage.setItem(key,migrated.id)}catch{/* The migrated copy remains available even if a preference is blocked. */}await this.write(store=>store.delete(item.id))}
      return this.native.all()
    }
    return this.legacyAll()
  }
  private async legacyAll():Promise<LibraryItem[]>{
    const database=await this.open()
    return new Promise((resolve,reject)=>{const transaction=database.transaction('items','readonly'),request=transaction.objectStore('items').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法读取本地资源库。'))})
  }
  async put(item:LibraryItem):Promise<LibraryItem|void>{if(this.native)return this.native.put(item);await this.write(store=>store.put(item));return item}
  async remove(id:string,deleteCopy=false){if(this.native)return this.native.remove(id,deleteCopy);return this.write(store=>store.delete(id))}
  private async write(action:(store:IDBObjectStore)=>void){
    const database=await this.open()
    return new Promise<void>((resolve,reject)=>{
      const transaction=database.transaction('items','readwrite')
      transaction.oncomplete=()=>resolve()
      transaction.onerror=transaction.onabort=()=>reject(new Error('本地保存失败，可能空间不足；原文件未改动。'))
      try{action(transaction.objectStore('items'))}catch{transaction.abort();reject(new Error('资源未能保存，原文件未改动。'))}
    })
  }
}
