import {describe,it,expect} from 'vitest'
import {normalizePreferences,updatePreferences,DEFAULT_PREFERENCES,savePreferences,loadPreferences} from '../../src/renderer/pages/settings/model'

describe('settings preview preferences',()=>{
  it('defaults to full motion and enables simplified motion only when explicitly selected',()=>{
    expect(normalizePreferences({}).reducedMotion).toBe(false)
    expect(updatePreferences(DEFAULT_PREFERENCES,{reducedMotion:true}).reducedMotion).toBe(true)
    expect(updatePreferences({...DEFAULT_PREFERENCES,reducedMotion:true},{reducedMotion:false}).reducedMotion).toBe(false)
  })
  it('migrates legacy mute/motion and excludes credentials and unknown fields',()=>{
    const value=normalizePreferences({muted:true,reducedMotion:true,apiKey:'secret'})
    expect(value).toEqual({...DEFAULT_PREFERENCES,muted:true,reducedMotion:true});expect(JSON.stringify(value)).not.toContain('secret')
  })
  it('normalizes corrupted ranges and preserves valid zero audio levels',()=>{
    const value=normalizePreferences({masterVolume:0,bgmVolume:200,sfxVolume:NaN,subtitleSpeed:20,uiScale:999,userName:'   '})
    expect(value.masterVolume).toBe(0);expect(value.bgmVolume).toBe(100);expect(value.sfxVolume).toBe(70);expect(value.subtitleSpeed).toBe(5);expect(value.uiScale).toBe(100);expect(value.userName).toBe('我')
  })
  it('round-trips only supported local preferences and survives blocked storage',()=>{
    let text='';const store={getItem:()=>text,setItem:(_key:string,value:string)=>{text=value}}
    savePreferences({...DEFAULT_PREFERENCES,userName:'新名字',sfxVolume:45},store)
    expect(loadPreferences(store).userName).toBe('新名字');expect(loadPreferences(store).sfxVolume).toBe(45)
    expect(()=>savePreferences(DEFAULT_PREFERENCES,{setItem(){throw Error('blocked')}})).not.toThrow()
    expect(loadPreferences({getItem(){throw Error('blocked')}})).toEqual(DEFAULT_PREFERENCES)
  })
})
