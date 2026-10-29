export type LibraryKind='document'|'background'|'music'
export interface LibraryItem{
  id:string;kind:LibraryKind;name:string;filename:string;extension:string;mime:string;size:number;blob:Blob
  addedAt:number;updatedAt:number;subject:string;textbook:string;chapter:string
  width?:number;height?:number;duration?:number;position:number
}
export const DOCUMENT_EXTENSIONS=['doc','docx','ppt','pptx','pdf','md','txt']
const supported={document:DOCUMENT_EXTENSIONS,background:['png','jpg','jpeg','webp'],music:['mp3','wav','ogg','flac','m4a']}
export const fileExtension=(name:string)=>name.split('.').at(-1)?.toLowerCase()??''
export const acceptsFile=(kind:LibraryKind,name:string)=>supported[kind].includes(fileExtension(name))
export const cleanName=(name:string)=>name.trim().slice(0,160)||null
export const needsImportEstimate=(files:readonly {size:number}[])=>files.length>200||files.some(file=>file.size>50*1024*1024)
export function formatBytes(value:number){return value<1024*1024?`${(value/1024).toFixed(1)} KB`:`${(value/1024/1024).toFixed(1)} MB`}
export function decodeText(bytes:Uint8Array,encoding?:string){
  if(encoding)return new TextDecoder(encoding).decode(bytes)
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes)
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes)
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('gb18030').decode(bytes)}
}
export function officePartNames(extension:string,names:string[]){
  if(extension==='docx')return names.filter(name=>name==='word/document.xml')
  return names.filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]))
}
