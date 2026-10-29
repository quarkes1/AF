import type {LibraryItem} from './model'

// User-selected file copies only. No access to arbitrary filesystem paths.
export class LibraryStorage{
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
    const database=await this.open()
    return new Promise((resolve,reject)=>{const transaction=database.transaction('items','readonly'),request=transaction.objectStore('items').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法读取本地资源库。'))})
  }
  async put(item:LibraryItem){return this.write(store=>store.put(item))}
  async remove(id:string){return this.write(store=>store.delete(id))}
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
