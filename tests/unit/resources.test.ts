import { describe, expect, it } from 'vitest'
import { createResourceCatalog } from '../../src/renderer/app/resources'

describe('registered resource boundary', () => {
  const records = [
    { id: 'brand.logo.dark', file: 'brand/logo.svg', status: 'approved' },
    { id: 'audio.rejected', file: 'audio/rejected.ogg', status: 'rejected' },
  ]
  it('resolves registered resources relative to dev and packaged entry URLs', () => {
    expect(createResourceCatalog(records, 'http://localhost:5173/').url('brand.logo.dark')).toBe('http://localhost:5173/assets/brand/logo.svg')
    expect(createResourceCatalog(records, 'file:///C:/AF/build/renderer/index.html').url('brand.logo.dark')).toBe('file:///C:/AF/build/renderer/assets/brand/logo.svg')
  })
  it('refuses rejected or unknown resources rather than accepting a supplied path', () => {
    const c = createResourceCatalog(records, 'http://localhost:5173/')
    expect(() => c.url('audio.rejected')).toThrow();expect(() => c.url('../secret')).toThrow()
  })
  it.each(['../secret', 'a/../../secret', '/secret', 'https://evil.test/a', 'C:\\secret', 'a/%2e%2e/secret', 'a\\file', 'a/file?query', 'a/file#frag'])('refuses unsafe registry path %s', file => {
    expect(() => createResourceCatalog([{id:'unsafe',file,status:'approved'}], 'http://localhost/')).toThrow()
  })
})
