export const HOME_BACKGROUNDS=[
  ['background.library-hall-day','图书馆走廊'],['background.library-reading-room-day','图书馆阅览室'],['background.sipailou-classroom-day','教室'],['background.sipailou-teaching-corridor-day','教学楼走廊'],['background.campus-courtyard-day','校园庭院'],['background.sipailou-auditorium-day','大礼堂'],['background.sipailou-plane-tree-avenue-day','梧桐大道'],
  ["background.nanjing-metro-platform-day", "地铁站台"],
  ["background.riverside-lighthouse-dusk", "灯塔黄昏"],
  ["background.nanjing-jiming-temple-day", "鸡鸣寺"],
  ["background.nanjing-xuanwu-lake-day", "玄武湖·白天"],
  ["background.nanjing-qinhuai-river-night", "秦淮河·夜景"],
  ["background.seu-liwenzheng-library-day", "李文正图书馆"],
] as const
const key='af.frontend-preview.home-background.v1'
export function readHomeBackground(){try{const stored=localStorage.getItem(key);return stored&&(stored.startsWith('user.background.')||stored.startsWith('background.'))?stored:HOME_BACKGROUNDS.find(([id])=>id===stored)?.[0]??HOME_BACKGROUNDS[0][0]}catch{return HOME_BACKGROUNDS[0][0]}}
export function rememberHomeBackground(id:string){try{localStorage.setItem(key,id)}catch{/* A blocked preference store does not prevent switching. */}}
