import {describe,expect,it} from 'vitest'
import {filterCourses,initialCourseView,selectChapter,type CourseView} from '../../src/renderer/pages/learning/model'
const course:CourseView={id:'math',name:'高等数学',textbook:'教学目录示例',textbookState:'inferred',resourceCount:2,reading:'阅读过第一节',practice:'尚未练习',chapters:[
  {id:'c1',name:'第一章 函数与极限',status:'ready',imageId:'background.campus-courtyard-day',sections:[{id:'s1',name:'1.1 映射与函数'}],materials:[]},
  {id:'c2',name:'第二章 导数与微分',status:'ready',imageId:'background.library-hall-day',sections:[{id:'s2',name:'2.1 导数的概念'},{id:'s3',name:'2.2 求导法则'}],materials:[]},
],last:{chapterId:'c2',sectionId:'s3'}}
describe('learning view state',()=>{
  it('selects a valid last section without marking anything complete',()=>{
    expect(initialCourseView(course)).toMatchObject({chapterId:'c2',sectionId:'s3',zoom:1})
    const next=selectChapter(course,'c1')
    expect(next).toEqual({chapterId:'c1',sectionId:'s1'})
    expect(course.practice).toBe('尚未练习')
  })
  it('reports an invalid prior anchor and falls back to valid directory content',()=>{
    expect(initialCourseView({...course,last:{chapterId:'deleted',sectionId:'deleted'}})).toMatchObject({chapterId:'c1',sectionId:'s1',anchorChanged:true})
  })
  it('matches course names and textbooks and keeps the original list untouched',()=>{
    expect(filterCourses([course],'  高等  ')).toHaveLength(1)
    expect(filterCourses([course],'目录')).toHaveLength(1)
    expect(filterCourses([course],'物理')).toEqual([])
  })
})
