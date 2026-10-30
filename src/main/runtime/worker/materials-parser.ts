import {parseDocument,type ParseInput} from '../../infrastructure/parsers/document'
process.on('message',(input:ParseInput)=>{void parseDocument({...input,bytes:Buffer.from(input.bytes)}).then(result=>process.send?.({ok:true,result}),error=>process.send?.({ok:false,error:error instanceof Error?error.message:'文档解析失败。'}))})
