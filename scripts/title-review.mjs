import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const args=process.argv.slice(2)
const period=args.find(arg=>['day','dusk','night'].includes(arg)) ?? 'auto'
const child=spawn(process.execPath,[resolve('node_modules/electron-vite/bin/electron-vite.js'),args.includes('--build')?'build':'dev'],{
  stdio:'inherit',env:{...process.env,VITE_TITLE_ART_REVIEW:'1',VITE_TITLE_PERIOD:period},windowsHide:true,
})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
