import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const env={...process.env,VITE_TITLE_ART_REVIEW:'1',VITE_TITLE_PERIOD:'auto',AF_TITLE_ART_TEST:'1'}
for(const args of [
  [resolve('node_modules/electron-vite/bin/electron-vite.js'),'build'],
  [resolve('node_modules/@playwright/test/cli.js'),'test','--config','config/playwright.config.ts','--grep','title scene review'],
]){
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env,windowsHide:true})
  if(result.status!==0){process.exitCode=result.status??1;break}
}
