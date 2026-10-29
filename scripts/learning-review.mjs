import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
const child=spawn(process.execPath,[resolve('node_modules/electron-vite/bin/electron-vite.js'),'dev'],{
  stdio:'inherit',env:{...process.env,VITE_LEARNING_REVIEW:'1'},windowsHide:true,
})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
