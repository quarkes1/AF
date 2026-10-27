import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { Connect } from 'vite'

interface CheckedAsset { file:string;sourcePath:string }
const mime:Record<string,string>={'.svg':'image/svg+xml','.png':'image/png','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.mp3':'audio/mpeg','.ogg':'audio/ogg','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'}

/** Development reads verified source files; never a mutable build/public cache. */
export function developmentAssets(resources:CheckedAsset[]):Connect.NextHandleFunction {
  const sources=new Map(resources.map(item=>[item.file,item.sourcePath]))
  return (request,response,next)=>{
    const raw=(request.url??'').split('?')[0]
    if(!raw.startsWith('/assets/')){next();return}
    const fail=(code:number,message:string)=>{
      response.removeHeader('Content-Length')
      response.statusCode=code;response.setHeader('Content-Type','text/plain; charset=utf-8');response.end(message)
    }
    if(request.method!=='GET'&&request.method!=='HEAD'){response.setHeader('Allow','GET, HEAD');fail(405,'Method not allowed');return}
    let file:string
    try{file=decodeURIComponent(raw.slice('/assets/'.length))}catch{fail(400,'Invalid asset URL');return}
    const source=sources.get(file)
    if(!source){fail(404,'Asset not registered');return}
    void (async()=>{
      const {size}=await stat(source)
      let start=0,end=size-1
      response.setHeader('Content-Type',mime[extname(file).toLowerCase()]??'application/octet-stream')
      response.setHeader('Cache-Control','no-cache')
      response.setHeader('Accept-Ranges','bytes')
      const range=request.headers.range
      if(range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(range)
        if(!match||(!match[1]&&!match[2])){response.setHeader('Content-Range',`bytes */${size}`);fail(416,'Invalid byte range');return}
        if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1}
        else {const count=Number(match[2]);start=Math.max(0,size-count);if(count===0)start=size}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){response.setHeader('Content-Range',`bytes */${size}`);fail(416,'Invalid byte range');return}
        response.statusCode=206;response.setHeader('Content-Range',`bytes ${start}-${end}/${size}`)
      }
      response.setHeader('Content-Length',end-start+1)
      if(request.method==='HEAD'){response.end();return}
      const stream=createReadStream(source,{start,end})
      stream.on('error',()=>{if(!response.headersSent)fail(404,'Asset unavailable');else response.destroy()})
      response.on('close',()=>stream.destroy())
      stream.pipe(response)
    })().catch(()=>{if(!response.headersSent)fail(404,'Asset unavailable');else response.destroy()})
  }
}
