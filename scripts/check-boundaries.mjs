import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const root = resolve('.')
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(resolve(path,e.name)) : [resolve(path,e.name)]))).flat()
}
const errors=[]
for (const path of await files(resolve(root,'src'))) {
  if (!/\.(tsx?|mjs)$/.test(path)) continue
  const rel=relative(root,path).replaceAll('\\','/'), text=await readFile(path,'utf8')
  const imports=Array.from(text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g),m=>m[1])
  for(const name of imports){
    if(rel.startsWith('src/renderer/') && (/^(node:|electron(?:\/|$)|fs(?:\/|$)|path(?:\/|$)|sqlite|better-sqlite3|child_process)/.test(name) || /(^|\/)main\//.test(name)))errors.push(`${rel}: disallowed renderer import ${name}`)
    if(rel.startsWith('src/shared/') && /^(node:|electron|react|fs$|path$)/.test(name))errors.push(`${rel}: shared runtime import ${name}`)
    if(rel.startsWith('src/main/') && (/react/.test(name)||/renderer/.test(name)))errors.push(`${rel}: main imports UI ${name}`)
  }
  if(rel.startsWith('src/shared/')){
    const runtimeText=text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'')
    if(/\b(document|window|localStorage)\b/.test(runtimeText))errors.push(`${rel}: DOM in shared`)
  }
}
if(errors.length)throw new Error(errors.join('\n'))
console.log('Import boundaries checked: renderer/preload/main separation; shared runtime independence.')
