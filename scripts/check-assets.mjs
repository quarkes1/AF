import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export async function checkedResources(repository = projectRoot, reviewIds = []) {
  const root = await realpath(resolve(repository, 'assets'))
  const registry = JSON.parse(await readFile(resolve(root, 'registry.json'), 'utf8'))
  const ids = new Set()
  const resources = []
  for (const item of registry.resources) {
    if (ids.has(item.id)) throw new Error(`Duplicate resource ID: ${item.id}`)
    ids.add(item.id)
    if (!['approved', 'ready'].includes(item.status) && !(item.status === 'review' && reviewIds.includes(item.id))) continue
    if (/[\\:%?#]/.test(item.file) || item.file.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`Unsafe resource: ${item.id}`)
    const path = await realpath(resolve(root, item.file))
    const rel = relative(root, path)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Resource escapes assets/: ${item.id}`)
    const bytes = await readFile(path)
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Resource hash mismatch: ${item.id}`)
    resources.push({ ...item, sourcePath: path })
  }
  return resources
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Verified ${(await checkedResources()).length} approved/ready resources; rejected resources excluded.`)
}
