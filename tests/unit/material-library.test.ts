import {describe,it,expect} from 'vitest'
import {fileExtension,acceptsFile,cleanName,needsImportEstimate,decodeText,officePartNames} from '../../src/renderer/pages/materials/model'
import {createResourceCatalog} from '../../src/renderer/app/resources'
import {MaterialLibrary} from '../../src/renderer/pages/materials/library'
import {LibraryStorage} from '../../src/renderer/pages/materials/storage'
import type {LibraryItem} from '../../src/renderer/pages/materials/model'
import {ILLUSTRATIONS,MUSIC_TRACKS} from '../../src/renderer/pages/materials/application-resources'

describe('actual imported resource boundaries',()=>{
  it('lists approved illustration resources and all music without cues, voice or rejected tracks',()=>{
    expect(ILLUSTRATIONS.some(item=>item.id==='character.af-guide.01-neutral')).toBe(false)
    expect(ILLUSTRATIONS.some(item=>item.id==='background.title-auditorium-night')).toBe(true)
    expect(ILLUSTRATIONS.some(item=>item.id==='texture.title-clouds')).toBe(false)
    expect(MUSIC_TRACKS.map(([id])=>id)).toContain('bgm.study.window-margin')
    expect(MUSIC_TRACKS.map(([id])=>id)).toContain('bgm.story.a-little-further')
    expect(MUSIC_TRACKS).toHaveLength(6)
    expect(MUSIC_TRACKS.every(([id])=>id.startsWith('bgm.')&&!id.includes('candidate'))).toBe(true)
  })
  it('accepts the seven document formats and only supported media categories',()=>{
    for(const extension of ['doc','docx','ppt','pptx','pdf','md','txt'])expect(acceptsFile('document',`lesson.${extension}`)).toBe(true)
    expect(fileExtension('课堂.PPTX')).toBe('pptx')
    expect(acceptsFile('background','unsafe.svg')).toBe(false)
    expect(acceptsFile('music','lecture.pdf')).toBe(false)
    expect(acceptsFile('background','campus.webp')).toBe(true)
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('My song')).toBe('My song')
  })
  it('offers a batch estimate for large files and batches instead of rejecting them',()=>{
    expect(needsImportEstimate([{size:51*1024*1024}])).toBe(true)
    expect(needsImportEstimate(Array.from({length:201},()=>({size:1})))).toBe(true)
    expect(needsImportEstimate([{size:12}])).toBe(false)
  })
  it('decodes actual UTF8 and UTF16 text and rejects unknown Office package layouts',()=>{
    expect(decodeText(new TextEncoder().encode('真实的内容'))).toContain('真实的内容')
    expect(decodeText(new Uint8Array([255,254,65,0,66,0]))).toContain('AB')
    expect(officePartNames('docx',['word/document.xml','word/header1.xml'])).toEqual(['word/document.xml'])
    expect(officePartNames('pptx',['ppt/slides/slide10.xml','ppt/slides/slide2.xml','ppt/slides/slide1.xml'])).toEqual(['ppt/slides/slide1.xml','ppt/slides/slide2.xml','ppt/slides/slide10.xml'])
  })
  it('allows opaque session URLs without replacing shipped catalog entries',()=>{
    const catalog=createResourceCatalog([{id:'fixed',file:'a.png',status:'approved'}],'http://localhost/')
    catalog.registerLocal('user.background.123','blob:http://localhost/123')
    expect(catalog.url('user.background.123')).toBe('blob:http://localhost/123')
    expect(()=>catalog.registerLocal('fixed','blob:http://localhost/x')).toThrow()
    expect(()=>catalog.registerLocal('user.background.x','file:///private')).toThrow()
    catalog.removeLocal('user.background.123');expect(catalog.has('user.background.123')).toBe(false)
    expect(catalog.url('fixed')).toBe('http://localhost/assets/a.png')
  })
})

class MemoryStorage extends LibraryStorage{
  entries:LibraryItem[]=[]
  fail=false
  override async all(){return this.entries}
  override async put(item:LibraryItem){if(this.fail)throw new Error('quota');this.entries=[...this.entries.filter(existing=>existing.id!==item.id),structuredClone(item)]}
  override async remove(id:string){this.entries=this.entries.filter(item=>item.id!==id)}
}
describe('file-library persistence and cancellation',()=>{
  const setup=()=>{const storage=new MemoryStorage(),catalog=createResourceCatalog([],'http://localhost/');return {storage,library:new MaterialLibrary(catalog,storage)}}
  it('publishes only after storage success and preserves successfully imported files on cancellation',async()=>{
    const {storage,library}=setup();await library.load()
    storage.fail=true
    const failed=await library.import([new File(['real content'],'a.txt')],'document',()=>{},new AbortController().signal)
    expect(failed.failures).toHaveLength(1);expect(library.getSnapshot().items).toHaveLength(0)
    storage.fail=false;const controller=new AbortController()
    const progress=await library.import([new File(['one'],'a.txt'),new File(['two'],'b.txt')],'document',progress=>{if(progress.completed===1)controller.abort()},controller.signal)
    expect(progress.completed).toBe(1);expect(storage.entries).toHaveLength(1)
    expect(await library.getSnapshot().items[0].blob.text()).toBe('one')
  })
  it('deduplicates by content and never resurrects a resource after queued removal',async()=>{
    const {storage,library}=setup();await library.load()
    await library.import([new File(['same'],'a.txt'),new File(['same'],'b.txt')],'document',()=>{},new AbortController().signal)
    expect(library.getSnapshot().items).toHaveLength(1)
    const id=library.getSnapshot().items[0].id
    const original=storage.put.bind(storage)
    storage.put=async item=>{await new Promise(resolve=>setTimeout(resolve,10));return original(item)}
    const update=library.update(id,{subject:'高等数学'})
    const removal=library.remove(id)
    await Promise.all([update,removal])
    expect(library.getSnapshot().items).toHaveLength(0);expect(storage.entries).toHaveLength(0)
  })
})
