/** Frontend preview templates, not the persisted character/save contracts. */
export const POSES=[['01-neutral','日常'],['02-smile','微笑'],['03-thinking','思考'],['04-confused','困惑'],['05-surprised','惊讶'],['06-explaining','讲解']] as const
export type PoseId=string
export const MAX_COMPANION_BYTES=64*1024*1024
export interface SpriteTag {id:PoseId;label:string}
const defaultPoses=():SpriteTag[]=>POSES.map(([id,label])=>({id,label}))
export interface CompanionView {
  templateVersion?:number
  id:string;name:string;builtIn:boolean;sourceKind:'original'|'existing';sourceWork:string;personality:string;partnerIdentity:string;userIdentity:string;address:string;background:string;knowledge:string;speech:string;relationship:string;initiative:string;immutable:string;events:string;poses:SpriteTag[];defaultPose:PoseId;sprites:Partial<Record<PoseId,string>>;draft:boolean;examples:boolean
}
export const blankCompanion=(id:string):CompanionView=>({id,name:'未命名搭档',builtIn:false,sourceKind:'original',sourceWork:'',personality:'',partnerIdentity:'',userIdentity:'',address:'',background:'现实校园',knowledge:'',speech:'',relationship:'刚认识不久',initiative:'跟随用户设置',immutable:'',events:'',poses:defaultPoses(),defaultPose:'01-neutral',sprites:{},draft:true,examples:false})
export const builtInCompanion:CompanionView={...blankCompanion('af-guide'),name:'Aurore',builtIn:true,sourceWork:'AF 原创搭档',personality:'温和、好奇，愿意一起寻找答案。',partnerIdentity:'同校的伙伴',userIdentity:'大学生',knowledge:'依据自身经历、被告知与实际查阅的内容回应。',sprites:Object.fromEntries(POSES.map(([id])=>[id,`character.af-guide.${id}`])),draft:false,examples:true}
export const copyCompanion=(source:CompanionView,id:string):CompanionView=>({...source,id,name:`${source.name} 的副本`,builtIn:false,poses:source.poses.map(pose=>({...pose})),sprites:{...source.sprites}})
export function validateCompanion(value:CompanionView,draft:boolean):string|null{
  const count=(s:string)=>[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(s.trim())].length
  if(!value.name.trim()||count(value.name)>64)return '搭档姓名需为 1–64 个字。'
  if(!draft&&!value.personality.trim())return '请填写人物设定，或先保存为草稿。'
  const ids=new Set<string>(),labels=new Set<string>()
  for(const pose of value.poses){
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(pose.id)||Object.hasOwn(Object.prototype,pose.id)||ids.has(pose.id))return '立绘标签标识重复或无效。'
    if(!pose.label.trim()||count(pose.label)>32||labels.has(pose.label.trim()))return '立绘标签名称需为 1–32 个字，且不能重名。'
    ids.add(pose.id);labels.add(pose.label.trim())
  }
  if(!ids.has(value.defaultPose))return '请选择一个默认立绘标签。'
  if(Object.keys(value.sprites).some(id=>!ids.has(id)))return '存在未关联标签的立绘。'
  if(!draft&&!value.sprites[value.defaultPose])return '请为默认标签添加立绘，或先保存为草稿。'
  if(!draft&&value.sourceKind==='existing'&&!value.sourceWork.trim())return '请填写角色所属作品。'
  for(const [key,text] of Object.entries(value))if(typeof text==='string'&&key!=='id'&&text.length>8000)return '单项设定过长，请控制在 8000 字符以内。'
  if(new TextEncoder().encode(encodeCompanion(value)).length>MAX_COMPANION_BYTES)return '搭档预览包总大小不能超过 64MB，请压缩立绘后重试。'
  return null
}
const fields=['name','sourceWork','personality','partnerIdentity','userIdentity','address','background','knowledge','speech','relationship','initiative','immutable','events'] as const
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
export const validSprite=(value:string)=>/^character\.[A-Za-z0-9._-]+$/.test(value)||(/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(value)&&value.length<7*1024*1024)
export function encodeCompanion(value:CompanionView){
  const {id:_,builtIn:__,templateVersion:___,...template}=value
  return JSON.stringify({format:'af-companion-preview',version:2,template},null,2)
}
export function decodeCompanion(text:string,id:string):CompanionView{
  if(text.length>MAX_COMPANION_BYTES)throw new Error('搭档预览包超过 64MB。')
  let data:unknown
  try{data=JSON.parse(text)}catch{throw new Error('无法读取 JSON 搭档预览包。')}
  if(!isRecord(data)||data.format!=='af-companion-preview'||![1,2].includes(Number(data.version))||typeof data.version!=='number'||!isRecord(data.template))throw new Error('请选择 AF 前端预览导出的搭档包。')
  const raw=data.template,allowed=new Set<string>([...fields,'sourceKind','sprites','draft','examples',...(data.version===2?['poses','defaultPose']:[])])
  if(Object.keys(raw).some(key=>!allowed.has(key)))throw new Error('搭档包含未支持的字段。')
  if(!['original','existing'].includes(String(raw.sourceKind))||typeof raw.draft!=='boolean'||typeof raw.examples!=='boolean'||!isRecord(raw.sprites))throw new Error('搭档包字段格式不正确。')
  const result=blankCompanion(id)
  for(const field of fields){if(typeof raw[field]!=='string'||raw[field].length>8000)throw new Error('搭档包文字字段格式不正确。');result[field]=raw[field]}
  result.sourceKind=raw.sourceKind as CompanionView['sourceKind'];result.draft=raw.draft;result.examples=raw.examples
  if(data.version===2){
    if(!Array.isArray(raw.poses)||typeof raw.defaultPose!=='string')throw new Error('立绘标签格式不正确。')
    result.poses=raw.poses.map(pose=>{
      if(!isRecord(pose)||Object.keys(pose).some(key=>key!=='id'&&key!=='label')||typeof pose.id!=='string'||typeof pose.label!=='string')throw new Error('立绘标签格式不正确。')
      return {id:pose.id,label:pose.label}
    });result.defaultPose=raw.defaultPose
  }
  for(const [pose,image] of Object.entries(raw.sprites)){
    if(!result.poses.some(({id})=>id===pose)||typeof image!=='string'||!validSprite(image))throw new Error('搭档包只支持已关联标签的登记立绘或内嵌 PNG，不接受网址或可执行资源。')
    result.sprites[pose as PoseId]=image
  }
  const error=validateCompanion(result,result.draft)
  if(error)throw new Error(error)
  return result
}
export function reviewCompanions():CompanionView[]{return Array.from({length:7},(_,i)=>({...blankCompanion(`review-custom-${i+1}`),name:i?'自设搭档 '+(i+1):'未命名搭档'}))}
