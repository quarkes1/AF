import registry from '../../../../assets/registry.json'
import backgrounds from '../../../../assets/backgrounds/manifest.json'
import audio from '../../../../assets/audio/manifest.json'

export type IllustrationRole='background'|'portrait'|'texture'
const backgroundNames=new Map<string,string>(backgrounds.backgrounds.map(item=>[item.id,item.label]))
const titles:Record<string,string>={'background.title-auditorium-dusk':'大礼堂 · 黄昏','background.title-auditorium-night':'大礼堂 · 夜晚','texture.title-clouds':'标题栏云层'}
const musicNames=new Map(audio.tracks.map(item=>[item.id,item.title]))
const approved=(item:{status:string})=>['approved','ready'].includes(item.status)

export const ILLUSTRATIONS=registry.resources.filter(item=>approved(item)&&item.kind==='background').map(item=>({
  id:item.id,name:backgroundNames.get(item.id)??titles[item.id]??item.id,role:item.kind as IllustrationRole,
}))
export const MUSIC_TRACKS:readonly (readonly [string,string])[]=registry.resources.filter(item=>approved(item)&&item.kind==='audio'&&item.id.startsWith('bgm.')).map(item=>[item.id,musicNames.get(item.id)??item.id] as const)
