import {unzipSync,strFromU8} from 'fflate'
import {officePartNames} from './model'

export interface OfficePage{title:string;paragraphs:string[]}
export interface OfficeContent{pages:OfficePage[];images:Blob[]}
const maximum=64*1024*1024

/** Local content preview, not a faithful Office layout or teaching-ingestion result. */
export function readOffice(bytes:Uint8Array,extension:string):OfficeContent{
  let total=0
  const files=unzipSync(bytes,{filter:entry=>{
    const selected=entry.name==='word/document.xml'||['ppt/presentation.xml','ppt/_rels/presentation.xml.rels'].includes(entry.name)||/^ppt\/slides\/slide\d+\.xml$/.test(entry.name)||/^(word|ppt)\/media\/[^/]+\.(png|jpe?g|webp)$/i.test(entry.name)
    if(!selected)return false
    total+=entry.originalSize
    if(entry.originalSize>maximum||total>maximum)throw new Error('文档展开后过大，当前内容预览未执行；原文件已保留。')
    return true
  }})
  let names=officePartNames(extension,Object.keys(files))
  if(extension==='pptx'&&files['ppt/presentation.xml']&&files['ppt/_rels/presentation.xml.rels']){
    const presentation=new DOMParser().parseFromString(strFromU8(files['ppt/presentation.xml']),'application/xml')
    const relations=new DOMParser().parseFromString(strFromU8(files['ppt/_rels/presentation.xml.rels']),'application/xml')
    const targets=new Map(Array.from(relations.getElementsByTagNameNS('*','Relationship')).filter(item=>item.getAttribute('TargetMode')!=='External').map(item=>[item.getAttribute('Id'),item.getAttribute('Target')?.replace(/^\//,'')]))
    const ordered=Array.from(presentation.getElementsByTagNameNS('*','sldId')).map(item=>{const target=targets.get(item.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));return target?.startsWith('ppt/')?target:`ppt/${target}`}).filter(name=>names.includes(name))
    if(ordered.length)names=ordered
  }
  if(!names.length)throw new Error('没有找到可预览的文档内容，文件可能损坏或被加密。')
  if(names.length>1000)throw new Error('文档页面过多，当前内容预览未执行；原文件已保留。')
  const pages=names.map((name,index)=>{
    const xml=new DOMParser().parseFromString(strFromU8(files[name]),'application/xml')
    if(xml.querySelector('parsererror'))throw new Error('文档内容损坏，无法生成预览。')
    const paragraphs=Array.from(xml.getElementsByTagNameNS('*','p')).map(paragraph=>Array.from(paragraph.getElementsByTagNameNS('*','t')).map(text=>text.textContent??'').join('')).filter(text=>text.trim())
    return {title:extension==='pptx'?`幻灯片 ${index+1}`:'文档正文',paragraphs}
  })
  const images=Object.entries(files).filter(([name])=>/\/media\//.test(name)).slice(0,24).map(([name,bytes])=>new Blob([bytes.slice().buffer],{type:/\.png$/i.test(name)?'image/png':/\.webp$/i.test(name)?'image/webp':'image/jpeg'}))
  return {pages,images}
}
