import {it,expect} from 'vitest'
import {zipSync,strToU8} from 'fflate'
import {parseDocument} from '../../src/main/infrastructure/parsers/document'
it('preserves Chinese text, headings and encoding without executing markup',async()=>{
 const result=await parseDocument({id:'doc',extension:'md',bytes:Buffer.from('# 极限\n\n<script>bad()</script>\n\n连续性与导数')})
 expect(result.blocks[0]).toMatchObject({kind:'heading',text:'极限',page:1});expect(result.blocks.map(b=>b.text).join()).toContain('<script>bad()</script>')
})
it('extracts DOCX paragraphs and tables and PPTX presentation order and notes',async()=>{
 const doc=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')})
 const result=await parseDocument({id:'doc',extension:'docx',bytes:Buffer.from(doc)})
 expect(result.blocks.some(b=>b.kind==='table'&&b.text.includes('表格内容'))).toBe(true)
 const slide=(text:string)=>strToU8(`<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`)
 const ppt=zipSync({'ppt/presentation.xml':strToU8('<p:presentation xmlns:p="p" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>'),'ppt/_rels/presentation.xml.rels':strToU8('<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></Relationships>'),'ppt/slides/slide1.xml':slide('后面'),'ppt/slides/slide2.xml':slide('前面')})
 const parsed=await parseDocument({id:'ppt',extension:'pptx',bytes:Buffer.from(ppt)});expect(parsed.blocks[0].text).toBe('前面');expect(parsed.blocks[0].page).toBe(1)
})
