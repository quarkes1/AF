import type {RichBlock} from './contracts/experience'

/** Keep teaching intact while omitting legacy authoring/extraction notes from the stage. */
export function teachingPresentation(blocks:RichBlock[]):RichBlock[]{
 return blocks.flatMap<RichBlock>(block=>{
  if(block.kind!=='text')return[block]
  if(/^说明[：:]\s*(?:以下|本次|本讲|本节|此处).*(?:课件|原文|提取|读取)/s.test(block.text.trim()))return[]
  const parts=block.text.match(/[^。！？\n]+[。！？]?/g)??[],text=parts.filter(part=>!/(?:课件|原文|源文档|提取结果|资料|公式).{0,70}(?:未逐字|未读到|未读取|被截断|仅通过语法|未独立核验|未独立验证)|includedBlocks|totalBlocks|不作内容断言/.test(part)).join('').trim()
  return text?[{...block,text}]:[]
 })
}
