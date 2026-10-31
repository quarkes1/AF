import katex from 'katex'
import {actDraftSchema} from '../../../shared/schemas/experience'
import type {Answer,ActDraft,BufferStatus,FrozenQuestion,NarrativeNode,RichBlock} from '../../../shared/contracts/experience'
import {graphemeCount,splitGraphemes} from '../../../shared/graphemes'
import {numericEquivalent,numericEquality} from '../learning/numeric'
import {normalizeNarrativeNames} from '../../../shared/narrative-language'

export function validateMath(latex:string){
 if(latex.length>4000||/\\(?:href|url|includegraphics|html\w*|def|gdef|edef|xdef|let|newcommand|renewcommand|providecommand|global|input|include|require|usepackage)\b/.test(latex))return{parseOk:false,mathematicalStatus:'unknown' as const,reason:'公式含不支持的命令。'}
 try{katex.renderToString(latex,{throwOnError:true,trust:false,strict:'error',maxExpand:100,maxSize:10,macros:{}})}catch{return{parseOk:false,mathematicalStatus:'unknown' as const,reason:'LaTeX 语法无法解析。'}}
 const sides=latex.replaceAll(' ','').split('=')
 if(sides.length===2){const result=numericEquality(sides[0],sides[1]);if(result!==null)return{parseOk:true,mathematicalStatus:result?'verified' as const:'rejected' as const,reason:'受限精确数值等式检查。'}}
 return{parseOk:true,mathematicalStatus:'unknown' as const,reason:'语法可解析，数学含义未独立核验。'}
}
export function validateRichBlocks(blocks:RichBlock[],sources:Set<string>){for(const block of blocks){for(const source of block.sourceRefs)if(!sources.has(source.blockId))throw new Error('INVALID_SOURCE');if(block.kind==='math'){const check=validateMath(block.latex);if(!check.parseOk||check.mathematicalStatus==='rejected')throw new Error('INVALID_MATH')}}}
export function validateActDraft(raw:unknown,poses:Set<string>,backgrounds:Set<string>):ActDraft{
 const draft=actDraftSchema.parse(raw)
 draft.title=normalizeNarrativeNames(draft.title)
 for(const node of draft.nodes){node.blocks=node.blocks.map(block=>block.kind==='text'?{...block,text:normalizeNarrativeNames(block.text)}:block);node.choices=node.choices.map(choice=>({...choice,label:normalizeNarrativeNames(choice.label)}))}
 for(const [i,node] of draft.nodes.entries()){
  validateRichBlocks(node.blocks,new Set())
  if(node.poseTag&&!poses.has(node.poseTag)||node.backgroundId&&!backgrounds.has(node.backgroundId))throw new Error('INVALID_RESOURCE')
  if(node.kind==='choice'&&(i!==draft.nodes.length-1||node.choices.length<2)||node.kind!=='choice'&&node.choices.length||new Set(node.choices.map(c=>c.id)).size!==node.choices.length)throw new Error('INVALID_INTERACTION')
 }
 if((draft.ending==='interaction')!==(draft.nodes.at(-1)?.kind==='choice'))throw new Error('INVALID_INTERACTION')
 return draft
}
export function paginateNodes(nodes:NarrativeNode[],capacity=80):NarrativeNode[]{
 const pages:NarrativeNode[]=[]
 for(const node of nodes){const first=pages.length;let blocks:RichBlock[]=[],size=0;const flush=()=>{if(blocks.length){pages.push({...node,blocks,choices:node.kind==='choice'?node.choices:[]});blocks=[];size=0}}
  for(const block of node.blocks){if(block.kind==='math'){flush();pages.push({...node,kind:node.kind==='choice'?'narration':node.kind,blocks:[block],choices:[]});continue}
   const glyphs=splitGraphemes(block.text);while(glyphs.length){let length=Math.min(capacity-size,glyphs.length);if(length<glyphs.length){const boundary=glyphs.slice(0,length).findLastIndex(c=>/[。！？；.!?;\n]/.test(c));if(boundary>=Math.floor(length/2))length=boundary+1}const text=glyphs.splice(0,Math.max(1,length)).join('');if(text.trim()){blocks.push({...block,text});size+=graphemeCount(text)}if(size>=capacity||glyphs.length)flush()}
  }flush()
  if(node.kind==='choice')for(let i=first;i<pages.length;i++){pages[i].kind=i===pages.length-1?'choice':node.speaker==='partner'?'dialogue':'narration';pages[i].choices=i===pages.length-1?node.choices:[]}
 }
 return pages
}
export function bufferStatus(pages:readonly {kind:string}[],cursor:number,complete:boolean,mode:'normal'|'afterInterrupt'|'continuing'):BufferStatus{
 const future=pages.slice(cursor),boundary=future.findIndex(p=>p.kind==='choice'),following=Math.max(0,(boundary<0?future.length:boundary+1)-1)
 return{validFollowingPages:following,complete,earliestInteractionIndex:boundary<0?null:cursor+boundary,canPlay:future.length>0&&(mode==='continuing'||mode==='normal'&&(complete||boundary>=0)||mode==='afterInterrupt'&&(following>=5||boundary>=0||complete&&future.length<=3))}
}
export function gradeObjective(question:Pick<FrozenQuestion,'type'|'answer'>&{tolerance?:string},answer:Answer):{correct:boolean;score:number;feedback:string}|null{
 if(['short','derivation','explanation'].includes(question.type))return null
 let correct=false
 if('choiceIds'in question.answer&&'choiceIds'in answer)correct=new Set(answer.choiceIds).size===answer.choiceIds.length&&[...question.answer.choiceIds].sort().join('|')===[...answer.choiceIds].sort().join('|')
 else if('number'in question.answer&&'number'in answer)correct=numericEquivalent(question.answer,answer,question.tolerance??'0')
 else if('text'in question.answer&&'text'in answer)correct=question.answer.text.normalize('NFKC').trim().toLocaleLowerCase()===answer.text.normalize('NFKC').trim().toLocaleLowerCase()
 return{correct,score:correct?1:0,feedback:correct?'符合冻结的参考答案。':'与冻结的参考答案不一致，可查看解析或申请复核。'}
}
