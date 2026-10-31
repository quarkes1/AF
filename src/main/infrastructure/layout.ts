import {BrowserWindow} from 'electron'
import {join} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {richBlockSchema} from '../../shared/schemas/experience'
import type {LayoutRequest,LayoutReport} from '../../shared/contracts/layout'

const requestSchema=z.object({blocks:z.array(richBlockSchema).min(1).max(160),mode:z.enum(['story','learning']),width:z.number().int().min(800).max(1920),height:z.number().int().min(600).max(1200),fontScale:z.number().min(1).max(1.5),capture:z.boolean().optional()}).strict()
async function bounded<T>(task:Promise<T>,signal?:AbortSignal):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined,abort:(()=>void)|undefined
 try{return await Promise.race([task,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('LAYOUT_TIMEOUT')),10000);timer.unref();abort=()=>reject(new Error('CANCELLED'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()})])}finally{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort)}
}
/** Hidden sandboxed renderer, with no preload/IPC or network, measures real bundled math fonts. */
export class LayoutValidator{
 private window:BrowserWindow|null=null;private chain:Promise<unknown>=Promise.resolve();private disposed=false
 constructor(private rendererDirectory:string,private userData:string,private developmentURL?:string){}
 dispose(){this.disposed=true;this.window?.destroy();this.window=null}
 async measure(raw:LayoutRequest,signal?:AbortSignal):Promise<LayoutReport>{
  const request=requestSchema.parse(raw);if(Buffer.byteLength(JSON.stringify(request))>256000)throw new Error('INVALID_LAYOUT')
  const task=this.chain.catch(()=>{}).then(async()=>{
   signal?.throwIfAborted();if(this.disposed)throw new Error('CANCELLED')
   let window=this.window
   if(!window||window.isDestroyed()){
    window=new BrowserWindow({show:false,skipTaskbar:true,width:request.width,height:request.height,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});this.window=window;window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault())
    try{await bounded(this.developmentURL?window.loadURL(new URL('validation.html',this.developmentURL).toString()):window.loadFile(join(this.rendererDirectory,'validation.html')),signal)}catch(error){window.destroy();this.window=null;throw error}
   }
   window.setContentSize(request.width,request.height)
   let result:LayoutReport
   try{result=await bounded(window.webContents.executeJavaScript(`window.afLayoutMeasure(${JSON.stringify(request)})`) as Promise<LayoutReport>,signal)}catch(error){if(!window.isDestroyed())window.destroy();this.window=null;throw error}
   signal?.throwIfAborted();if(!result.fontReady||!result.ok)throw new Error('INVALID_LAYOUT')
   if(request.capture){const directory=join(this.userData,'cache','layout-previews');mkdirSync(directory,{recursive:true});const id=randomUUID(),image=await bounded(window.webContents.capturePage(),signal);signal?.throwIfAborted();if(image.isEmpty())throw new Error('INVALID_LAYOUT');writeFileSync(join(directory,`${id}.png`),image.toPNG());result.previewRef=`layout-preview:${id}`}
   return result
  });this.chain=task;return task
 }
 async matrix(blocks:LayoutRequest['blocks'],mode:LayoutRequest['mode'],signal:AbortSignal){const reports:LayoutReport[]=[];for(const width of [1100,1280,1440,1920])for(const fontScale of [1,1.25,1.5])reports.push(await this.measure({blocks,mode,width,height:900,fontScale,capture:fontScale===1.5},signal));return reports}
}
