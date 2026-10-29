import {lazy,Suspense,useEffect,useState,useCallback} from 'react'
import {decodeText,type LibraryItem} from './model'
import {readOffice,type OfficeContent} from './office-preview'

const PdfPreview=lazy(()=>import('./PdfPreview').then(module=>({default:module.PdfPreview})))

export function DocumentPreview({item,retry,encoding,onResult}:{item:LibraryItem;retry:number;encoding:string;onResult:(id:string,error:string|null)=>void}){
  const [text,setText]=useState(''),[office,setOffice]=useState<OfficeContent|null>(null),[images,setImages]=useState<string[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[page,setPage]=useState(0)
  const legacy=['doc','ppt'].includes(item.extension)
  const reportPdf=useCallback((message:string|null)=>onResult(item.id,message),[item.id,onResult])
  useEffect(()=>{
    let active=true;const urls:string[]=[]
    setText('');setOffice(null);setImages([]);setError(null);setPage(0)
    if(legacy||item.extension==='pdf'){setBusy(false);return}
    setBusy(true)
    void item.blob.arrayBuffer().then(data=>{
      if(!active)return
      if(['txt','md'].includes(item.extension)){
        const bytes=new Uint8Array(data),limit=2*1024*1024
        setText(decodeText(bytes.subarray(0,limit),encoding||undefined)+(bytes.length>limit?'\n\n[预览仅显示前 2 MB；原文件完整保留]':''))
      }else{
        const content=readOffice(new Uint8Array(data),item.extension)
        setOffice(content);content.images.forEach(image=>urls.push(URL.createObjectURL(image)));setImages([...urls])
      }
      onResult(item.id,null)
    }).catch(reason=>{if(active){const message=reason instanceof Error?reason.message:'内容无法预览。';setError(message);onResult(item.id,message)}}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false;urls.forEach(URL.revokeObjectURL)}
  },[item.id,item.blob,retry,encoding,legacy,onResult])
  if(legacy)return <div className="document-unavailable"><h3>原文件已保存</h3><p>旧版 {item.extension.toUpperCase()} 的转换器尚未接入，当前无法在应用内预览。</p><p>可下载原文件查看；不会将此文件标记为已解析或可学习。</p></div>
  if(item.extension==='pdf')return <Suspense fallback={<p>正在加载 PDF 预览…</p>}><PdfPreview key={retry} blob={item.blob} onResult={reportPdf}/></Suspense>
  if(busy)return <p role="status">正在读取文件内容…</p>
  if(error)return <p role="status" className="materials-error">{error}</p>
  if(office)return <div className="document-office">
    {office.pages.length>1&&<div className="document-page-controls"><button disabled={!page} onClick={()=>setPage(value=>value-1)} aria-label="上一张幻灯片">‹</button><span>{page+1} / {office.pages.length}</span><button disabled={page>=office.pages.length-1} onClick={()=>setPage(value=>value+1)} aria-label="下一张幻灯片">›</button></div>}
    <article><h3>{office.pages[page]?.title}</h3>{office.pages[page]?.paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}{!office.pages[page]?.paragraphs.length&&<p>此页没有可提取的正文；图片列于下方。</p>}</article>
    {!!images.length&&<details><summary>文件内图片（最多预览 24 张）</summary>{images.map(url=><img key={url} src={url} alt="原文件内嵌图片"/>)}</details>}
  </div>
  return <pre className="document-text">{text}</pre>
}
