import {it,expect} from 'vitest'
import {teachingPresentation} from '../../src/shared/teaching-presentation'
it('removes authoring diagnostics from the blackboard without deleting teaching conditions or derivation',()=>{
 const blocks:any[]=[{kind:'text',text:'说明：以下为基于课件标题与结点方程的独立讲解，不是课件原文；未读到的定理正文不作内容断言。',sourceRefs:[]},{kind:'text',text:'其余独立源按零值处理：电压源短接、电流源断开。这一取值约定属于通用做法，课件本页未逐字写出。',sourceRefs:[]},{kind:'text',text:'适用范围：在线性电路中，功率不能直接叠加。',sourceRefs:[]}]
 const result=teachingPresentation(blocks);expect(result).toHaveLength(2);expect(result[0]).toMatchObject({text:'其余独立源按零值处理：电压源短接、电流源断开。'});expect(result[1].kind==='text'&&result[1].text).toContain('功率不能直接叠加');expect(blocks).toHaveLength(3)
})
