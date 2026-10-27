import { describe, expect, it } from 'vitest'
import { shouldEnterFromTitle, shouldSkipStartup } from '../../src/renderer/features/startup/keyboard'
describe('startup keyboard focus ownership',()=>{
  it('allows Escape from a focused mute button but leaves Space/Enter to that button',()=>{
    expect(shouldSkipStartup({key:'Escape'},'button')).toBe(true)
    expect(shouldSkipStartup({key:' '},'button')).toBe(false)
    expect(shouldSkipStartup({key:'Enter'},'button')).toBe(false)
  })
  it('accepts a fresh ordinary key at the title but not a held skip key or system shortcuts',()=>{
    expect(shouldEnterFromTitle({key:'x'},'none')).toBe(true)
    expect(shouldEnterFromTitle({key:' ',repeat:true},'none')).toBe(false)
    expect(shouldEnterFromTitle({key:'Shift'},'none')).toBe(false)
    expect(shouldEnterFromTitle({key:'F4',altKey:true},'none')).toBe(false)
    expect(shouldEnterFromTitle({key:'Enter'},'button')).toBe(false)
  })
  it('never interprets composing, repeated or modified keys as startup skip',()=>{
    expect(shouldSkipStartup({key:'Enter',isComposing:true},'none')).toBe(false)
    expect(shouldSkipStartup({key:' ',repeat:true},'none')).toBe(false)
    expect(shouldSkipStartup({key:'Enter',ctrlKey:true},'none')).toBe(false)
  })
  it('does not take keys from editable content',()=>{
    expect(shouldSkipStartup({key:'Escape'},'editable')).toBe(false)
    expect(shouldSkipStartup({key:'Enter'},'none')).toBe(true)
  })
})
