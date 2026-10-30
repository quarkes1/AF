import {cp,mkdir,access,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
export async function prepareDocumentRuntime(){
 const root=resolve('build/compiled/resources')
 const skills=JSON.parse(await readFile(resolve('assets/skills/manifest.json'),'utf8')) as {skills:{file:string;sha256:string}[]}
 for(const skill of skills.skills){if(skill.file.includes('..')||skill.file.startsWith('/'))throw new Error('Unsafe bundled Skill path');const bytes=await readFile(resolve('assets/skills',skill.file));if(createHash('sha256').update(bytes).digest('hex')!==skill.sha256)throw new Error('Bundled Skill hash mismatch')}
 await mkdir(root,{recursive:true});await cp(resolve('assets/skills'),resolve(root,'skills'),{recursive:true})
 await cp(resolve('assets/licenses'),resolve(root,'licenses'),{recursive:true})
 try{
  const manifest=await readFile(resolve('build/runtime/documents/provenance.json'),'utf8')
  let prepared=false
  try{prepared=await readFile(resolve(root,'document-runtime/provenance.json'),'utf8')===manifest;for(const file of ['chi_sim.traineddata.gz','eng.traineddata.gz','libreoffice/program/soffice.com'])await access(resolve(root,'document-runtime',file))}catch{prepared=false}
  if(!prepared){await cp(resolve('build/runtime/documents'),resolve(root,'document-runtime'),{recursive:true,force:false,errorOnExist:false});await writeFile(resolve(root,'document-runtime/provenance.json'),manifest)}
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 for(const dir of ['cmaps','standard_fonts']){const target=resolve(root,'document-runtime/pdfjs',dir);try{await access(target)}catch{await cp(resolve('node_modules/pdfjs-dist',dir),target,{recursive:true})}}
}
