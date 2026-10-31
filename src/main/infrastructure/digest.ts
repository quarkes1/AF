import {createHash} from 'node:crypto'
export const canonicalJson=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item)
export const contentHash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex')
