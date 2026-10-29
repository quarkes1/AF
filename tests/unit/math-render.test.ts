import {describe,expect,it} from 'vitest'
import {renderFormula} from '../../src/renderer/math/render'
describe('local LaTeX renderer',()=>{
  it('renders real accessible math without external resources',()=>{
    const result=renderFormula(String.raw`f'(a)=\lim_{h\to0}\frac{f(a+h)-f(a)}{h}`)
    expect(result.ok).toBe(true);expect(result.html).toContain('katex');expect(result.html).toContain('<math')
  })
  it('reports malformed input and blocks external/HTML/macro commands',()=>{
    for(const source of [String.raw`\frac{1}{`,String.raw`\href{https://example.com}{x}`,String.raw`\htmlStyle{color:red}{x}`,String.raw`\def\a{\a}\a`])expect(renderFormula(source).ok).toBe(false)
    expect(renderFormula('x'.repeat(5000)).ok).toBe(false)
  })
})
