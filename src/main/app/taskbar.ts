import {createHash} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

export const taskbarApplicationId=(testMode:boolean)=>testMode?'org.auroraforge.ui-test':'org.auroraforge.desktop'

export function cacheTaskbarIcon(source:string,userData:string){
  const bytes=readFileSync(source),hash=createHash('sha256').update(bytes).digest('hex').slice(0,16)
  const directory=resolve(userData,'app-icons'),target=resolve(directory,`aurore-${hash}.ico`)
  mkdirSync(directory,{recursive:true})
  // Shell/pinned taskbar entries must not point at an ephemeral build chunk or ASAR.
  if(!existsSync(target)||!readFileSync(target).equals(bytes))writeFileSync(target,bytes)
  return target
}

function quoteArgument(value:string){return `"${value.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')}"`}
export function taskbarDetails({executable,entry,iconPath,testMode}:{executable:string;entry?:string;iconPath:string;testMode:boolean}){
  return {appId:taskbarApplicationId(testMode),appIconPath:iconPath,appIconIndex:0,relaunchDisplayName:'Aurora Forge',relaunchCommand:[executable,...(entry?[entry]:[])].map(quoteArgument).join(' ')}
}
