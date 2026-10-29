export interface ResourceRecord { id: string; file: string; status: string }

export function createResourceCatalog(records: readonly ResourceRecord[], entryUrl: string, reviewIds: readonly string[] = []) {
  const files = new Map<string, string>()
  const local = new Map<string,string>()
  for (const record of records) {
    if (!['approved', 'ready'].includes(record.status) && !(record.status === 'review' && reviewIds.includes(record.id))) continue
    const path = record.file
    if (!path || /[\\:%?#]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) {
      throw new Error(`Unsafe resource registration: ${record.id}`)
    }
    if (files.has(record.id)) throw new Error(`Duplicate resource: ${record.id}`)
    files.set(record.id, path)
  }
  return {
    has: (id: string) => files.has(id)||local.has(id),
    registerLocal(id:string,url:string){
      if(!/^user\.(background|music)\.[a-zA-Z0-9-]+$/.test(id)||files.has(id)||!url.startsWith('blob:'))throw new Error('Invalid user resource')
      local.set(id,url)
    },
    removeLocal(id:string){local.delete(id)},
    url(id: string): string {
      if(local.has(id))return local.get(id)!
      const file = files.get(id)
      if (!file) throw new Error(`Resource unavailable: ${id}`)
      return new URL(`assets/${file}`, new URL('.', entryUrl)).href
    },
  }
}
export type ResourceCatalog = ReturnType<typeof createResourceCatalog>
