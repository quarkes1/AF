import {it,expect} from 'vitest'
import {readCategoryCatalog} from '../../src/main/runtime/category-catalog'
it('bounds large library pages and searches topic scope beyond the initial page',()=>{
 const catalog=Array.from({length:80},(_,i)=>({id:`course-${i}`,name:`课程${i}`,aliases:[],stateVersion:0,textbook:null,examples:Array.from({length:3},(_,j)=>({documentId:`d${i}-${j}`,summary:(i===75?'极限连续性':'实验材料').repeat(300),topics:['学习'],materialType:'课件',categoryBasis:'course'}))}))
 const page=readCategoryCatalog(catalog,{})
 expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(12000);expect(page.courses.length).toBeLessThanOrEqual(5);expect(page.nextOffset).not.toBeNull()
 const found=readCategoryCatalog(catalog,{query:'极限'})
 expect(found.courses.map(c=>c.id)).toEqual(['course-75'])
 expect(readCategoryCatalog(catalog,{offset:5,limit:2}).courses[0].id).toBe('course-5')
})
