import {mkdir,writeFile,readFile,stat,access} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import {Readable} from 'node:stream'
import {createHash} from 'node:crypto'
import {resolve,join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const root=resolve('build/runtime/documents'),cache=resolve('build/runtime/downloads')
const lock=JSON.parse(await readFile(resolve('config/document-runtime.json'),'utf8'))
await mkdir(root,{recursive:true});await mkdir(cache,{recursive:true})
const records=[]
async function download(url,path){try{await access(path)}catch{const response=await fetch(url,{signal:AbortSignal.timeout(900000)});if(!response.ok)throw new Error(`Download HTTP ${response.status}`);await pipeline(Readable.fromWeb(response.body),createWriteStream(path))}const bytes=await readFile(path);return{source:url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}
for(const language of ['eng','chi_sim']){const path=join(root,language+'.traineddata.gz');const pinned=lock.records.find(x=>x.id===language);const record=await download(pinned.source,path);if(record.sha256!==pinned.sha256)throw new Error(`OCR ${language} checksum mismatch`);records.push({id:language,...record});console.log(`Prepared OCR ${language}`)}
if(process.platform==='win32'){
 const file='LibreOffice_26.2.6_Win_x86-64.msi',url=`https://download.documentfoundation.org/libreoffice/stable/26.2.6/win/x86_64/${file}`,path=join(cache,file)
 const record=await download(url,path)
 if(record.sha256!==lock.records.find(x=>x.id==='libreoffice').sha256)throw new Error('Pinned LibreOffice checksum mismatch')
 const checksum=await fetch(url+'.sha256',{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw new Error('Official checksum unavailable');return r.text()})
 if(!checksum.includes(record.sha256))throw new Error('LibreOffice checksum mismatch')
 const target=join(root,'libreoffice');await mkdir(target,{recursive:true})
 await promisify(execFile)('msiexec.exe',['/a',path,'/qn',`TARGETDIR=${target}`],{windowsHide:true,timeout:300000})
 records.push({id:'libreoffice',version:'26.2.6',...record});console.log('Prepared managed LibreOffice extraction')
}
await writeFile(join(root,'provenance.json'),JSON.stringify({records},null,2)+'\n')
console.log(`Document runtime ready in build/runtime/documents; ${records.length} verified components.`)
