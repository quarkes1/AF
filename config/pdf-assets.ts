import {readdir,mkdir,cp} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'

export async function pdfSupportFiles(root:string){
  const files:{file:string;sourcePath:string}[]=[]
  for(const directory of ['cmaps','standard_fonts']){
    const source=resolve(root,'node_modules/pdfjs-dist',directory)
    for(const name of await readdir(source))files.push({file:`vendor/pdfjs/${directory}/${name}`,sourcePath:resolve(source,name)})
  }
  files.push({file:'vendor/pdfjs/LICENSE',sourcePath:resolve(root,'node_modules/pdfjs-dist/LICENSE')})
  return files
}
export async function copyPdfSupport(files:{file:string;sourcePath:string}[],output:string){
  for(const item of files){const target=resolve(output,'assets',item.file);await mkdir(dirname(target),{recursive:true});await cp(item.sourcePath,target)}
}
