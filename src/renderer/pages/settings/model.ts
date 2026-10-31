import {graphemeCount} from '../../../shared/graphemes'
export interface AudioPreferences {masterVolume:number;bgmVolume:number;sfxVolume:number;attenuateOnBlur:boolean}
export interface SettingsPreferences extends AudioPreferences {muted:boolean;reducedMotion:boolean;uiScale:100|125|150;typewriter:boolean;subtitleSpeed:number;userName:string}
export const DEFAULT_PREFERENCES:SettingsPreferences={muted:false,reducedMotion:false,uiScale:100,typewriter:true,subtitleSpeed:4,masterVolume:60,bgmVolume:35,sfxVolume:70,attenuateOnBlur:false,userName:'我'}
export const PREFERENCES_KEY='af.frontend-preview.preferences.v1'
export const SETTINGS_SECTIONS=[['display','显示与声音'],['companion','搭档与互动'],['sources','资料与来源'],['model','模型与预算'],['data','存档与数据'],['help','帮助与诊断']] as const
export type SettingsSection=typeof SETTINGS_SECTIONS[number][0]
export function normalizePreferences(raw:unknown):SettingsPreferences{
  const data=raw&&typeof raw==='object'?raw as Record<string,unknown>:{}
  const range=(key:keyof SettingsPreferences,low:number,high:number)=>typeof data[key]==='number'&&Number.isFinite(data[key])?Math.max(low,Math.min(high,data[key] as number)):DEFAULT_PREFERENCES[key] as number
  const userName=typeof data.userName==='string'?data.userName.trim():''
  return {muted:data.muted===true,reducedMotion:data.reducedMotion===true,uiScale:data.uiScale===125||data.uiScale===150?data.uiScale:100,typewriter:data.typewriter!==false,subtitleSpeed:range('subtitleSpeed',3,5),masterVolume:range('masterVolume',0,100),bgmVolume:range('bgmVolume',0,100),sfxVolume:range('sfxVolume',0,100),attenuateOnBlur:data.attenuateOnBlur===true,userName:userName&&graphemeCount(userName)<=32?userName:'我'}
}
export function updatePreferences(current:SettingsPreferences,patch:Partial<SettingsPreferences>):SettingsPreferences{
  return normalizePreferences({...current,...patch})
}
export function loadPreferences(store?:Pick<Storage,'getItem'>):SettingsPreferences{
  try{return normalizePreferences(JSON.parse((store??localStorage).getItem(PREFERENCES_KEY)??'{}'))}catch{return {...DEFAULT_PREFERENCES}}
}
export function savePreferences(value:SettingsPreferences,store?:Pick<Storage,'setItem'>){
  try{(store??localStorage).setItem(PREFERENCES_KEY,JSON.stringify(normalizePreferences(value)));return true}catch{return false}
}
