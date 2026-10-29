import type {CourseView,LessonView} from './model'

const derivative:LessonView={
  intro:'从平均变化率，到瞬时变化率。',paragraphs:['让间隔逐渐缩小，观察割线怎样接近切线。','导数描述函数在指定位置附近的变化趋势。'],
  formula:String.raw`f'(a)=\lim_{h\to0}\frac{f(a+h)-f(a)}{h}`,graph:'derivative',source:'自编界面示例 · 不对应实际教材页码',
  question:{prompt:'对于函数，求指定位置的导数。',choices:['0','2','4'],correct:1,explanation:'按幂函数求导法则求出导函数，再代入指定位置。此反馈仅供界面验收，不计入学习记录。'},
}
const chapterNames=['第一章 函数与极限','第二章 导数与微分','第三章 微分中值定理','第四章 不定积分','第五章 定积分','第六章 定积分的应用']
export const reviewCourses:CourseView[]=[
  {id:'review-math',name:'高等数学',textbook:'高等数学（上册）· 目录示例',textbookState:'inferred',resourceCount:3,reading:'停留于 2.1 导数的概念',practice:'尚无练习证据',last:{chapterId:'math-2',sectionId:'math-2-1'},chapters:chapterNames.map((name,i)=>({
    id:`math-${i+1}`,name,status:'ready',imageId:i%2?'background.library-hall-day':'background.campus-courtyard-day',
    sections:(i===1?['2.1 导数的概念','2.2 函数的求导法则','2.3 高阶导数','2.4 函数的微分']:[`${i+1}.1 本章概念`,`${i+1}.2 例题与讨论`]).map((title,j)=>({id:`math-${i+1}-${j+1}`,name:title,...(i===1&&j===0?{lesson:derivative}:{})})),
    materials:[{id:`math-source-${i}`,name:'教材目录示例',location:`${name} · 待核对版本`},{id:`math-slides-${i}`,name:'课堂课件示例',location:'演示资料清单 · 无实际文件'}],
  }))},
  {id:'review-physics',name:'大学物理',textbook:'大学物理 · 教材待核对',textbookState:'generic',resourceCount:2,reading:'尚未开始阅读',practice:'尚未开始练习',chapters:[
    {id:'physics-1',name:'第一章 质点运动学',status:'ready',imageId:'background.campus-courtyard-day',sections:[{id:'physics-1-1',name:'1.1 位置、位移与速度'}],materials:[{id:'physics-slides',name:'运动学课件示例',location:'课件目录示例'}]},
    {id:'physics-2',name:'第二章 牛顿运动定律',status:'parsing',imageId:'background.library-hall-day',sections:[],materials:[]},
    {id:'physics-3',name:'第三章 动量与能量',status:'failed',imageId:'background.campus-courtyard-day',sections:[],materials:[]},
  ]},
  {id:'review-algebra',name:'线性代数',textbook:'线性代数 · 目录示例',textbookState:'inferred',resourceCount:1,reading:'尚未开始阅读',practice:'尚未开始练习',chapters:[{id:'algebra-1',name:'第一章 行列式',status:'ready',imageId:'background.library-hall-day',sections:[{id:'algebra-1-1',name:'1.1 行列式的定义'}],materials:[]}]},
  {id:'review-english',name:'大学英语',textbook:'综合英语课件 · 尚未设置主教材',textbookState:'generic',resourceCount:4,reading:'尚未开始阅读',practice:'尚未开始练习',chapters:[]},
  {id:'review-programming',name:'程序设计基础与计算思维',textbook:'程序设计 · 通用目录示例',textbookState:'generic',resourceCount:2,reading:'尚未开始阅读',practice:'尚未开始练习',chapters:[]},
]
