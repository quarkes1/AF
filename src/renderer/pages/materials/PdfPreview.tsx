import {useEffect,useRef,useState} from 'react'
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type RenderTask,type PDFDocumentLoadingTask} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc=workerUrl

export function PdfPreview({blob,onResult}:{blob:Blob;onResult:(error:string|null)=>void}){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState<string|null>(null),[passwordNeeded,setPasswordNeeded]=useState(false),[password,setPassword]=useState(''),[rendered,setRendered]=useState(false),[renderedPage,setRenderedPage]=useState(0)
  const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null),unlock=useRef<((value:string)=>void)|null>(null),renderTask=useRef<RenderTask|null>(null)
  useEffect(()=>{
    let active=true,task:PDFDocumentLoadingTask|undefined
    setPdf(null);setError(null);setPage(1);setPasswordNeeded(false);setPassword('');setRendered(false)
    void blob.arrayBuffer().then(data=>{
      if(!active)return
      task=getDocument({data,useWasm:false,useSystemFonts:true,cMapUrl:new URL('assets/vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('assets/vendor/pdfjs/standard_fonts/',document.baseURI).href})
      task.onPassword=(callback:(value:string)=>void,reason:number)=>{if(active){unlock.current=callback;setPasswordNeeded(true);setPassword('');if(reason===2)setError('密码不正确，请重试。')}}
      return task.promise.then(value=>{if(active){setPdf(value);setPasswordNeeded(false);setError(null);unlock.current=null;onResult(null)}})
    }).catch(reason=>{if(active){const message=reason instanceof Error?`PDF 无法预览：${reason.message}`:'PDF 无法预览。';setError(message);onResult(message)}})
    return()=>{active=false;unlock.current=null;renderTask.current?.cancel();void task?.destroy()}
  },[blob,onResult])
  useEffect(()=>{
    if(!pdf||!canvas.current||!host.current)return
    let active=true,frame=0,generation=0,lastWidth=-1,lastScale=-1,rendering:Promise<void>=Promise.resolve()
    const requestRender=()=>{
      const width=(host.current?.clientWidth??0)-8,scale=Math.min(2,window.devicePixelRatio||1)
      // Height is produced by our own render. Observing it must not enqueue work.
      // Defer the first frames of the expanding sidebar rather than painting at 0px.
      if(width<64||width===lastWidth&&scale===lastScale)return
      lastWidth=width;lastScale=scale
      const request=++generation
      renderTask.current?.cancel();cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        frame=0
        rendering=rendering.catch(()=>{}).then(async()=>{
          if(!active||request!==generation)return
          const current=await pdf.getPage(page)
          if(!active||request!==generation||!canvas.current)return
          const initial=current.getViewport({scale:1})
          const viewport=current.getViewport({scale:width/initial.width*scale}),target=canvas.current
          if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<=0||viewport.height<=0||viewport.width*viewport.height>16_000_000||viewport.height>32767)throw new Error('页面尺寸超出当前预览范围。')
          setRendered(false)
          const buffer=document.createElement('canvas');buffer.width=Math.ceil(viewport.width);buffer.height=Math.ceil(viewport.height)
          const task=current.render({canvas:buffer,viewport});renderTask.current=task
          try{
            await task.promise
            if(active&&request===generation){target.width=buffer.width;target.height=buffer.height;target.style.width=`${viewport.width/scale}px`;target.style.height=`${viewport.height/scale}px`;target.getContext('2d')!.drawImage(buffer,0,0);setRenderedPage(page);setRendered(true);setError(null);onResult(null)}
          }finally{if(renderTask.current===task)renderTask.current=null}
        }).catch(reason=>{if(active&&request===generation&&reason?.name!=='RenderingCancelledException'){const message='这一页无法显示，原文件已保留。';setError(message);onResult(message)}})
      })
    }
    const observer=new ResizeObserver(requestRender)
    observer.observe(host.current);window.addEventListener('resize',requestRender);requestRender()
    return()=>{active=false;generation++;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',requestRender);renderTask.current?.cancel()}
  },[pdf,page,onResult])
  return <div className="document-pdf">
    {passwordNeeded&&<form onSubmit={event=>{event.preventDefault();setError(null);unlock.current?.(password);setPassword('')}}><p>此 PDF 已加密，请输入密码查看；密码不会保存。</p><input type="password" aria-label="PDF 密码" value={password} onChange={event=>setPassword(event.target.value)}/><button>解锁预览</button></form>}
    {error&&<p role="status" className="materials-error">{error}</p>}
    {!pdf&&!passwordNeeded&&!error&&<p role="status">正在读取 PDF…</p>}
    {pdf&&<div className="document-page-controls"><button disabled={page<=1} onClick={()=>{setRendered(false);setPage(value=>value-1)}} aria-label="上一页">‹</button><span>{page} / {pdf.numPages}</span><button disabled={page>=pdf.numPages} onClick={()=>{setRendered(false);setPage(value=>value+1)}} aria-label="下一页">›</button></div>}
    <div ref={host} className="document-pdf__canvas"><canvas ref={canvas} aria-label="PDF 原始页面预览" data-rendered={rendered} data-page={rendered?renderedPage:0} hidden={!pdf}/></div>
  </div>
}
