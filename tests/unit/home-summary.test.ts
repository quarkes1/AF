import {it,expect} from 'vitest'
import {homeStorySummary,previewLastLine} from '../../src/renderer/pages/home/summary'
import type {StoryView} from '../../src/renderer/pages/saves/model'
import {resolveHomeMusic} from '../../src/renderer/pages/home/music'
it('uses the same available music fallback for startup and the picker',()=>{
  expect(resolveHomeMusic('bgm.home.suno-02',id=>id==='bgm.home.suno-01')).toBe('bgm.home.suno-01')
  expect(resolveHomeMusic('bgm.home.suno-01',()=>false)).toBeNull()
})
it('uses exact empty copy and the newest modified story chapter rather than its file name',()=>{
  expect(homeStorySummary([])).toMatchObject({action:'开始故事',chapter:'全新的起点',line:'与你的日常，\n就是奇迹'})
  const stories=[{id:'a',name:'存档名称',chapter:'01-03',chapterName:'雨后的约定',lastLine:'下次一起再来。',savedAt:'2026-10-28T00:00:00Z'},{id:'b',chapter:'02-01',chapterName:'全新的起点',savedAt:'2026-10-20T00:00:00Z',modifiedAt:'2026-10-29T00:00:00Z'}] as StoryView[]
  expect(homeStorySummary(stories)).toMatchObject({action:'继续故事',chapter:'全新的起点',latest:{id:'b'},line:'与你的日常，\n就是奇迹'})
})
it('shows the first fifteen graphemes, appending three periods only when longer',()=>{
  expect(previewLastLine('字'.repeat(15))).toBe('字'.repeat(15))
  expect(previewLastLine('字'.repeat(16))).toBe('字'.repeat(15)+'...')
  expect(previewLastLine('e\u0301'.repeat(16))).toBe('e\u0301'.repeat(15)+'...')
})
