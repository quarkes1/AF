import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
// @ts-expect-error Plain Node build tool.
import { prepareRendererAssets } from '../../scripts/prepare-assets.mjs'

describe('asset build output closure',()=>{
  it('removes revoked and stale assets, excludes unregistered fonts, and keeps approved dependencies',async()=>{
    await mkdir('build/reports',{recursive:true})
    const root=await mkdtemp(resolve('build/reports/asset-staging-'))
    const assets=resolve(root,'assets');await mkdir(resolve(assets,'fonts'),{recursive:true})
    await writeFile(resolve(assets,'logo.svg'),'original-logo')
    await writeFile(resolve(assets,'fonts/unregistered.ttf'),'unregistered')
    const sha=createHash('sha256').update('original-logo').digest('hex')
    const registry=resolve(assets,'registry.json')
    await writeFile(registry,JSON.stringify({resources:[{id:'logo',file:'logo.svg',status:'approved',sha256:sha}]}))
    const output=resolve(root,'build/compiled/resources/ui')
    await prepareRendererAssets(root,output)
    expect(await readFile(resolve(output,'assets/logo.svg'),'utf8')).toBe('original-logo')
    await expect(access(resolve(output,'assets/fonts/unregistered.ttf'))).rejects.toThrow()
    await writeFile(resolve(output,'assets/stale.svg'),'stale')
    await writeFile(registry,JSON.stringify({resources:[{id:'logo',file:'logo.svg',status:'rejected',sha256:sha}]}))
    await prepareRendererAssets(root,output)
    await expect(access(resolve(output,'assets/logo.svg'))).rejects.toThrow()
    await expect(access(resolve(output,'assets/stale.svg'))).rejects.toThrow()
  })
  it('refuses to recursively clean anywhere except the exact generated staging directory',async()=>{
    await expect(prepareRendererAssets(process.cwd(),resolve('assets'))).rejects.toThrow(/staging/)
  })
})
