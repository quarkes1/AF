import {describe,it,expect} from 'vitest'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {taskbarApplicationId,taskbarDetails,cacheTaskbarIcon} from '../../src/main/app/taskbar'

describe('Windows taskbar identity',()=>{
  it('provides a complete relaunch identity and isolates test windows from the real app',()=>{
    const details=taskbarDetails({executable:'C:\\Program Files\\AF\\electron.exe',entry:'C:\\My Project\\AF',iconPath:'C:\\data\\aurore.ico',testMode:false})
    expect(details.relaunchCommand).toBe('"C:\\Program Files\\AF\\electron.exe" "C:\\My Project\\AF"')
    expect(details.relaunchDisplayName).toBe('Aurora Forge')
    expect(details.appIconPath).toBe('C:\\data\\aurore.ico')
    expect(details.appId).not.toBe(taskbarApplicationId(true))
    expect(taskbarDetails({executable:'C:\\AF\\AuroraForge.exe',iconPath:'C:\\data\\aurore.ico',testMode:false}).relaunchCommand).toBe('"C:\\AF\\AuroraForge.exe"')
  })
  it('keeps the icon available after the generated build asset has disappeared',()=>{
    const root=mkdtempSync(resolve(tmpdir(),'af-taskbar-test-'))
    try{
      const source=resolve(root,'source.ico'),data=Buffer.from('icon fixture')
      writeFileSync(source,data)
      const cached=cacheTaskbarIcon(source,resolve(root,'profile'))
      rmSync(source)
      expect(readFileSync(cached)).toEqual(data)
      expect(cached).toContain('app-icons')
    }finally{rmSync(root,{recursive:true,force:true})}
  })
})
