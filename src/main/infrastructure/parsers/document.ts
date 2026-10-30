import {DOMParser} from '@xmldom/xmldom'
import {unzipSync,strFromU8} from 'fflate'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {resolve,join,basename} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import type {ContentBlock} from '../../../shared/contracts/materials'
export interface ParseInput{id:string;extension:string;bytes:Buffer;cacheDir?:string;runtimeDir?:string;password?:string;encoding?:string}
export interface ParsedDocument{blocks:ContentBlock[];warnings:string[];parserVersion:'af-1';images:{id:string;file:string}[]}
export async function parseDocument(input:ParseInput):Promise<ParsedDocument>{
 const blocks:ContentBlock[]=[],warnings:string[]=[],images:{id:string;file:string}[]=[]
 const add=(text:string,kind:ContentBlock['kind']='paragraph',page=1,quality:ContentBlock['quality']='native',imageId?:string)=>{if(text.trim()||imageId)blocks.push({id:randomUUID(),text:text.trim(),kind,page,quality,...imageId?{imageId}:{}})}
 const image=async(bytes:Uint8Array,page:number,extension='png')=>{const id=createHash('sha256').update(bytes).digest('hex');if(input.cacheDir){await mkdir(input.cacheDir,{recursive:true});const file=join(input.cacheDir,`${id}.${extension}`);await writeFile(file,bytes);images.push({id,file})}add('', 'image',page,'native',id);return id}
 if(['txt','md'].includes(input.extension)){
  let text:string;try{text=new TextDecoder(input.encoding??'utf-8',{fatal:true}).decode(input.bytes)}catch{text=new TextDecoder('gb18030').decode(input.bytes)}
  for(const paragraph of text.split(/\r?\n\s*\r?\n|(?=^#{1,6}\s)/m)){const match=paragraph.match(/^#{1,6}\s+([^\n]+)(?:\n([\s\S]*))?$/);if(match){add(match[1],'heading');if(match[2])add(match[2])}else add(paragraph)}
 }else if(['docx','pptx'].includes(input.extension)){
  let expanded=0;const files=unzipSync(input.bytes,{filter:e=>{expanded+=e.originalSize;if(expanded>128*1024*1024)throw new Error('文档展开内容超过128MB，需分批处理。');return /^(word|ppt)\//.test(e.name)}})
  const xml=(name:string)=>{if(!files[name])throw new Error('缺少必要文档结构。');const text=strFromU8(files[name]);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('文档包含不支持的实体声明。');return new DOMParser({onError:()=>{throw new Error('文档结构损坏。')}}).parseFromString(text,'application/xml')}
  const elements=(node:any,name:string):any[]=>Array.from(node.getElementsByTagNameNS('*',name))
  const text=(node:any)=>elements(node,'t').map(n=>n.textContent).join('')
  if(input.extension==='docx'){
   const doc=xml('word/document.xml')
   for(const p of elements(doc,'p')){let parent=p.parentNode,table=false;while(parent){if(parent.localName==='tbl'){table=true;break}parent=parent.parentNode}if(!table)add(text(p),elements(p,'pStyle').some(s=>/heading|标题/i.test(s.getAttribute('w:val')??s.getAttribute('val')))?'heading':'paragraph')}
   for(const table of elements(doc,'tbl'))add(elements(table,'tr').map(row=>elements(row,'tc').map(cell=>text(cell)).join(' | ')).join('\n'),'table')
   for(const formula of elements(doc,'oMath'))add(text(formula),'formula',1,'review')
  }else{
   let names=Object.keys(files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]))
   if(files['ppt/presentation.xml']&&files['ppt/_rels/presentation.xml.rels']){const rels=new Map(elements(xml('ppt/_rels/presentation.xml.rels'),'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));const order=elements(xml('ppt/presentation.xml'),'sldId').map(e=>String(rels.get(e.getAttribute('r:id'))??'')).map(n=>n.startsWith('/ppt/')?n.slice(1):n.startsWith('ppt/')?n:'ppt/'+n).filter(n=>names.includes(n));if(order.length)names=order}
   for(const [index,name] of names.entries()){
    const doc=xml(name);for(const p of elements(doc,'p'))add(text(p),'paragraph',index+1)
    const relName=name.replace('/slides/','/slides/_rels/')+'.rels';if(files[relName])for(const relation of elements(xml(relName),'Relationship')){const target=relation.getAttribute('Target');if(target?.startsWith('../notesSlides/')){const note='ppt/'+target.slice(3);if(files[note])for(const p of elements(xml(note),'p'))add(text(p),'paragraph',index+1)}}
   }
  }
  for(const [name,data] of Object.entries(files))if(/\/media\/.*\.(png|jpe?g|webp)$/i.test(name))await image(data,1,name.split('.').at(-1))
 }else if(['doc','ppt'].includes(input.extension)){
  const ole=input.bytes.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))
  if(!ole&&!(input.extension==='doc'&&input.bytes.subarray(0,6).toString().startsWith('{\\rtf')))throw new Error('文件内容与旧版 Office 格式不符，原件已保留。')
  if(!input.runtimeDir||!input.cacheDir)throw new Error('AF 安装完整性错误：缺少随包 Office 转换组件。')
  const candidates=[join(input.runtimeDir,'libreoffice','LibreOffice','program','soffice.com'),join(input.runtimeDir,'libreoffice','program','soffice.com')]
  const executable=candidates.find(existsSync);if(!executable)throw new Error('AF 安装完整性错误：Office 转换组件缺失，请修复 AF。')
  await mkdir(input.cacheDir,{recursive:true});const source=join(input.cacheDir,'original.'+input.extension);await writeFile(source,input.bytes)
  const format=input.extension==='doc'?'docx':'pptx';const profileDir=join(input.cacheDir,'lo-profile');await mkdir(join(profileDir,'user'),{recursive:true})
  await writeFile(join(profileDir,'user','registrymodifications.xcu'),'<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>')
  const profile=pathToFileURL(profileDir).href
  await promisify(execFile)(executable,[`-env:UserInstallation=${profile}`,'--headless','--nologo','--nodefault','--norestore','--convert-to',format,'--outdir',input.cacheDir,source],{windowsHide:true,timeout:120000,maxBuffer:1024*1024})
  const converted=join(input.cacheDir,'original.'+format);if(!existsSync(converted))throw new Error('旧格式转换失败：可能损坏或已加密；原件保留。')
  return parseDocument({...input,extension:format,bytes:await readFile(converted)})
 }else if(input.extension==='pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loading=pdfjs.getDocument({data:new Uint8Array(input.bytes),password:input.password,useSystemFonts:true,useWasm:false,...input.runtimeDir?{cMapUrl:pathToFileURL(join(input.runtimeDir,'pdfjs','cmaps')+'/').href,cMapPacked:true,standardFontDataUrl:pathToFileURL(join(input.runtimeDir,'pdfjs','standard_fonts')+'/').href}:{}})
  const pdf=await loading.promise
  let ocr:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|undefined
  try{
   for(let page=1;page<=pdf.numPages;page++){
    const p=await pdf.getPage(page);const content=await p.getTextContent();const text=content.items.map(i=>'str'in i?i.str:'').join(' ').trim();if(text.length>15)add(text,'paragraph',page)
    const {createCanvas}=await import('@napi-rs/canvas');const viewport=p.getViewport({scale:1.4});if(viewport.width*viewport.height>16_000_000)throw new Error('PDF 页面尺寸超出处理范围。')
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await p.render({canvas:canvas as any,canvasContext:canvas.getContext('2d') as any,viewport}).promise
    const png=canvas.toBuffer('image/png');await image(png,page)
    if(text.length<=15){
     if(!input.runtimeDir||!existsSync(join(input.runtimeDir,'chi_sim.traineddata.gz'))){warnings.push(`第${page}页需要 OCR，AF OCR 组件缺失。`);add('扫描页需要 OCR','paragraph',page,'review');continue}
     if(!ocr){const {createWorker}=await import('tesseract.js');ocr=await createWorker('chi_sim+eng',1,{langPath:input.runtimeDir,cacheMethod:'none',gzip:true,logger:()=>{}})}
     const result=await ocr.recognize(png);add(result.data.text,'paragraph',page,result.data.confidence>=80?'ocr':'review');if(result.data.confidence<80)warnings.push(`第${page}页 OCR 待核对。`)
    }
   }
  }finally{await ocr?.terminate();await loading.destroy()}
 }else throw new Error('不支持的文档格式。')
 if(!blocks.length)throw new Error('未找到可解析内容，原文件已保留。')
 return{blocks,warnings,images,parserVersion:'af-1'}
}
