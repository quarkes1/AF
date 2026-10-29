import {useEffect,useRef} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
import {selectChapter,type CourseMapState,type CourseView} from './model'

export function ChapterMap({course,state,resources,onChange}:{course:CourseView;state:CourseMapState;resources:ResourceCatalog;onChange:(patch:Partial<CourseMapState>)=>void}){
  const viewport=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null)
  useEffect(()=>{
    const element=viewport.current
    if(element){element.scrollLeft=state.scrollLeft;element.scrollTop=state.scrollTop}
  },[course.id,state.directory])
  const points=course.chapters.map((chapter,index)=>({chapter,x:12+index*235,y:[32,86,132,196,166][index%5]}))
  const width=Math.max(1100,points.length*235+36)
  const choose=(id:string)=>onChange(id===state.chapterId?{detailOpen:true}:{...selectChapter(course,id),detailOpen:true})
  return <section className="chapter-map course-panel" aria-label="章节地图">
    <header className="chapter-map__heading"><span/><h2>章节地图</h2><p>按照教材目录浏览，各章节均可自由选择。</p></header>
    {state.anchorChanged&&<p className="chapter-map__warning" role="status">原停留位置已失效，已回到可用目录起点。</p>}
    <div ref={viewport} className={`chapter-map__viewport${state.directory?' chapter-map__viewport--directory':''}`} tabIndex={0} aria-label={state.directory?'章节文本目录':'可滚动的章节地图'}
      onScroll={event=>{if(!state.directory)onChange({scrollLeft:event.currentTarget.scrollLeft,scrollTop:event.currentTarget.scrollTop})}}
      onPointerDown={event=>{
        if((event.target as HTMLElement).closest('button')||event.button!==0)return
        drag.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop}
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event=>{if(drag.current){event.currentTarget.scrollLeft=drag.current.left+drag.current.x-event.clientX;event.currentTarget.scrollTop=drag.current.top+drag.current.y-event.clientY}}}
      onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
      {state.directory?<ol className="chapter-directory">{course.chapters.map(chapter=><li key={chapter.id}><button aria-pressed={state.chapterId===chapter.id} onClick={()=>choose(chapter.id)}><strong>{chapter.name}</strong><span>{chapter.status==='ready'?`${chapter.sections.length} 个小节`:chapter.status==='parsing'?'目录解析中':'目录解析失败'}</span><Icon name="chevron-right" resources={resources}/></button></li>)}</ol>:<div className="chapter-map__extent" style={{width:width*state.zoom,height:480*state.zoom}}>
        <div className="chapter-map__track" style={{width,height:480,transform:`scale(${state.zoom})`}}>
          <svg className="chapter-map__connections" width={width} height="480" aria-hidden="true"><polyline points={points.map(p=>`${p.x+84},${p.y+206}`).join(' ')} fill="none" stroke="rgba(239,244,248,.8)" strokeWidth="2"/></svg>
          {points.map(({chapter,x,y})=><button key={chapter.id} className="chapter-stop" style={{left:x,top:y}} onClick={()=>choose(chapter.id)} aria-label={`选择${chapter.name}`} aria-pressed={state.chapterId===chapter.id}>
            <span className="chapter-card"><img src={resources.url(chapter.imageId)} alt="" draggable="false"/>{course.last?.chapterId===chapter.id&&<small className="chapter-card__last">上次学习</small>}<strong><span>{chapter.name.split(' ')[0]}</span>{chapter.name.split(' ').slice(1).join(' ')}</strong>{chapter.status!=='ready'&&<small className="chapter-card__state">{chapter.status==='parsing'?'目录解析中':'解析失败'}</small>}</span><span className="chapter-stop__dot"/>
          </button>)}
        </div>
      </div>}
    </div>
    <footer className="chapter-map__tools"><div><button className="quiet-button" disabled={state.directory||state.zoom<=.7} onClick={()=>onChange({zoom:Math.max(.7,Number((state.zoom-.1).toFixed(1)))})} aria-label="缩小地图"><Icon name="minus" resources={resources}/></button><span>{Math.round(state.zoom*100)}%</span><button className="quiet-button" disabled={state.directory||state.zoom>=1.5} onClick={()=>onChange({zoom:Math.min(1.5,Number((state.zoom+.1).toFixed(1)))})} aria-label="放大地图"><Icon name="plus" resources={resources}/></button></div><button className="quiet-button" aria-pressed={state.directory} onClick={()=>onChange({directory:!state.directory})}><Icon name={state.directory?'book-open':'list'} resources={resources}/>{state.directory?'地图视图':'目录视图'}</button></footer>
  </section>
}
