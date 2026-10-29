import { access, cp, lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { checkedResources } from './check-assets.mjs'

/** Recreate only the exact generated staging directory; never sweep source assets. */
export async function prepareRendererAssets(repository, output, reviewIds = []) {
  const root = await realpath(resolve(repository))
  const expected = resolve(root, 'build/compiled/resources/ui')
  if (resolve(output) !== expected) throw new Error('Refusing to clean outside the exact generated asset staging directory')
  let parent=root
  for(const segment of ['build','compiled','resources','ui']) {
    parent=resolve(parent,segment)
    try { if((await lstat(parent)).isSymbolicLink()) throw new Error('Refusing linked asset staging path') }
    catch(error) { if(error.code!=='ENOENT') throw error }
  }
  const resources = await checkedResources(root, reviewIds)
  await rm(expected, { recursive: true, force: true })
  await mkdir(resolve(expected,'assets'), {recursive:true})
  for(const item of resources) {
    const target=resolve(expected,'assets',item.file)
    await mkdir(dirname(target),{recursive:true});await cp(item.sourcePath,target)
  }
  // Only narrowly listed upstream notices, never unregistered font/audio files.
  const notices = [
    ['THIRD_PARTY_NOTICES.md','assets/licenses/THIRD_PARTY_NOTICES.md'],
    ['assets/fonts/source-han-sans/OFL.txt','assets/fonts/source-han-sans/OFL.txt'],
    ['assets/fonts/inter/OFL.txt','assets/fonts/inter/OFL.txt'],
    ['assets/fonts/katex/OFL.txt','assets/fonts/katex/OFL.txt'],
    ['assets/fonts/katex/LICENSE','assets/fonts/katex/LICENSE'],
    ['assets/icons/LICENSE','assets/licenses/ICONS-LICENSE'],
    ['assets/licenses/fflate-LICENSE','assets/licenses/fflate-LICENSE'],
    ['assets/audio/licenses/GeneralUser-GS-LICENSE.txt','assets/licenses/audio/GeneralUser-GS-LICENSE.txt'],
  ]
  for(const [source,file] of notices) {
    const from=resolve(root,source),target=resolve(expected,file)
    try { await access(from) } catch(error) { if(error.code==='ENOENT')continue;throw error }
    if((await lstat(from)).isSymbolicLink())throw new Error('Linked license source not allowed')
    await mkdir(dirname(target),{recursive:true});await cp(from,target)
  }
  await writeFile(resolve(expected,'assets/resource-index.json'),JSON.stringify(resources.map(({id,file,status})=>({id,file,status}))))
  return resources.length
}
