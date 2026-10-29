import {sortStories,type StoryView} from '../saves/model'
export const HOME_EMPTY_LINE='与你的日常，\n就是奇迹'
export function previewLastLine(value:string){
  const text=value.trim(),chars=Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),part=>part.segment)
  return chars.length>15?chars.slice(0,15).join('')+'...':text
}
export function homeStorySummary(stories:readonly StoryView[]){
  const latest=sortStories(stories)[0]??null
  const fullLine=latest?.lastLine?.trim()||HOME_EMPTY_LINE
  return {latest,action:latest?'继续故事':'开始故事',chapter:latest?.chapterName?.trim()||latest?.chapter||'全新的起点',line:latest?.lastLine?.trim()?previewLastLine(fullLine):HOME_EMPTY_LINE,fullLine}
}
