const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'})
export const splitGraphemes=(text:string)=>[...segmenter.segment(text)].map(s=>s.segment)
export const graphemeCount=(text:string)=>splitGraphemes(text).length
export const graphemePrefix=(text:string,count:number)=>splitGraphemes(text).slice(0,count).join('')
