import {zipSync,strToU8} from 'fflate'

export function examplePdf(pageHeight=480){
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>`,'',
  ]
  for(const [index,text] of [[4,'REAL PDF PAGE ONE'],[6,'REAL PDF PAGE TWO']] as const){const stream=`BT /F1 18 Tf 30 410 Td (${text}) Tj ET\n`;objects[index]=`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`}
  let output='%PDF-1.4\n';const offsets=[0]
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`})
  const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(output)
}
export function exampleDocx(){return Buffer.from(zipSync({
  '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>真实 DOCX 讲义内容</w:t></w:r></w:p><w:p><w:r><w:t>从原文件读取的第二段。</w:t></w:r></w:p></w:body></w:document>'),
}))}
export function examplePptx(reordered=false){return Buffer.from(zipSync({
  'ppt/presentation.xml':strToU8(`<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${(reordered?[2,1]:[1,2]).map(index=>`<p:sldId id="${255+index}" r:id="rId${index}"/>`).join('')}</p:sldIdLst></p:presentation>`),
  'ppt/_rels/presentation.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>'),
  'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>导数与微分：真实课件首页</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'),
  'ppt/slides/slide2.xml':strToU8('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>实际第二页：变化率</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'),
}))}
