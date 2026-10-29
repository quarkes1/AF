import {useMemo} from 'react'
import {renderFormula} from './render'

export function Formula({latex,inline=false}:{latex:string;inline?:boolean}){
  const result=useMemo(()=>renderFormula(latex,!inline),[latex,inline])
  return result.ok?<span className={inline?'math-inline':'math-formula'} dangerouslySetInnerHTML={{__html:result.html}}/>:<span className="math-fallback" role="status">{result.reason}<code>{latex}</code></span>
}
