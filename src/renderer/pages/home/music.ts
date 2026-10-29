import {MUSIC_TRACKS} from '../materials/application-resources'
export const HOME_MUSIC=[['bgm.home.suno-01','新しい朝の光'],['bgm.home.suno-02','君と紡ぐ日々']] as const
export function resolveHomeMusic(preferred:string,has:(id:string)=>boolean){return (preferred.startsWith('user.music.')&&has(preferred)?preferred:null)??MUSIC_TRACKS.find(([id])=>id===preferred&&has(id))?.[0]??HOME_MUSIC.find(([id])=>has(id))?.[0]??null}
const key='af.frontend-preview.home-music.v1'
export function readHomeMusic(){try{const stored=localStorage.getItem(key);return stored?.startsWith('user.music.')?stored:MUSIC_TRACKS.find(([id])=>id===stored)?.[0]??HOME_MUSIC[0][0]}catch{return HOME_MUSIC[0][0]}}
export function rememberHomeMusic(id:string){try{localStorage.setItem(key,id)}catch{/* Playback remains usable without preference storage. */}}
