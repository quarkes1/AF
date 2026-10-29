import katex from 'katex'

export function renderFormula(latex:string,displayMode=true):{ok:boolean;html:string;reason?:string}{
  if(latex.length>4000||/\\(?:href|url|includegraphics|html\w*|def|gdef|edef|xdef|let|newcommand|renewcommand|providecommand|global|input|include|require|usepackage)\b/.test(latex))return {ok:false,html:'',reason:'公式包含不支持的命令或超出长度限制。'}
  try{
    return {ok:true,html:katex.renderToString(latex,{displayMode,output:'htmlAndMathml',throwOnError:true,trust:false,strict:'error',maxExpand:100,maxSize:10,macros:{}})}
  }catch{return {ok:false,html:'',reason:'此公式暂无法显示，可查看原始 LaTeX。'}}
}
