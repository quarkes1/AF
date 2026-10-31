import {renderFormula} from './math/render'
import type {LayoutRequest,LayoutReport} from '../shared/contracts/layout'
import './validation.css'

declare global{interface Window{afLayoutMeasure:(request:LayoutRequest)=>Promise<LayoutReport>}}
window.afLayoutMeasure=async request=>{
 const root=document.getElementById('validation-root')!;root.replaceChildren();root.style.width=`${request.width*(request.mode==='learning'?.68:.88)-64}px`;root.style.fontSize=`${(request.mode==='learning'?18:24)*request.fontScale}px`
 const diagnostics:string[]=[]
 for(const [index,block] of request.blocks.entries()){
  const element=document.createElement('section');element.className=`validation-block validation-block--${block.kind}`;element.dataset.index=String(index)
  if(block.kind==='text')element.textContent=block.text
  else{const result=renderFormula(block.latex,block.display!=='inline');if(!result.ok){element.textContent=result.reason??'公式无法渲染';diagnostics.push(`block ${index}: invalid LaTeX`)}else element.innerHTML=result.html}
  root.append(element)
 }
 await document.fonts.ready
 const fontFailed=[...document.fonts].some(font=>font.status==='error');if(fontFailed)diagnostics.push('A bundled font failed to load')
 const elements=[...root.children] as HTMLElement[],blocks=elements.map((element,index)=>{const rect=element.getBoundingClientRect();if(!Number.isFinite(rect.width)||rect.width<=0||rect.height<=0)diagnostics.push(`block ${index}: invalid dimensions`);if(index){const previous=elements[index-1].getBoundingClientRect();if(rect.top-previous.bottom<11.5)diagnostics.push(`block ${index}: insufficient block spacing`)}return{index,width:rect.width,height:rect.height,requiresHorizontalScroll:element.scrollWidth>element.clientWidth+1}})
 return{ok:diagnostics.length===0,fontReady:document.fonts.status==='loaded'&&!fontFailed,viewport:{width:request.width,height:request.height,fontScale:request.fontScale},blocks,diagnostics}
}
