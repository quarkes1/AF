export interface ResourceRecord { id: string; file: string; status: string }

export function createResourceCatalog(records: readonly ResourceRecord[], entryUrl: string, reviewIds: readonly string[] = []) {
  const files = new Map<string, string>()
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
    has: (id: string) => files.has(id),
    url(id: string): string {
      const file = files.get(id)
      if (!file) throw new Error(`Resource unavailable: ${id}`)
      return new URL(`assets/${file}`, new URL('.', entryUrl)).href
    },
  }
}
export type ResourceCatalog = ReturnType<typeof createResourceCatalog>
