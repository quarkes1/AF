import {useEffect,useState} from 'react'
import type {StoryClient} from '../saves/backend-client'
import type {StoryView} from '../saves/model'
import type {ScriptPage} from '../../../shared/contracts/experience'
import type {StoryRecord} from '../../../shared/contracts/story'
import type {ResourceCatalog} from '../../app/resources'
import {experienceCall} from '../../features/experience/client'
import {RichContent} from '../../features/experience/RichContent'
export function CheckpointReader({client,story,checkpointId,resources,onBack}:{client:StoryClient;story:StoryView;checkpointId:string;resources:ResourceCatalog;onBack:()=>void}){
 const [view,setView]=useState<{page:ScriptPage;index:number;total:number}|null>(null),[record,setRecord]=useState<StoryRecord|null>(null),[error,setError]=useState('')
 const load=async(index=0)=>{try{const scope={saveId:story.id,branchId:story.branchId!};setView(await experienceCall(client,scope,'save.replay',{checkpointId,cursor:{pageIndex:index}}));setRecord(await client.call('save.get',{saveId:story.id}));setError('')}catch(e){setError(e instanceof Error?e.message:'无法读取保存点。')}}
 useEffect(()=>{void load()},[story.id,checkpointId])
 const character=record?.characterSnapshot.content,image=character?.sprites[view?.page.poseTag??character.defaultPose]??character?.sprites[character.defaultPose]
 return <section className="story-stage" data-open="true" style={{zIndex:6}} aria-label="只读回看"><img className="story-stage__background" src={resources.url(view?.page.backgroundId??'background.library-hall-day')} alt=""/>{image&&<img className="story-stage__partner" src={image.startsWith('data:')?image:resources.url(image)} alt={character?.name}/>}<header className="story-stage__title">只读回看 · {story.name}</header><nav className="story-stage__top"><button onClick={onBack}>返回保存点</button></nav>{error&&<p className="story-status" role="alert">{error}</p>}{view?.page&&<div className="story-dialogue"><div className="story-dialogue__speaker">{view.page.speaker==='partner'?character?.name:view.page.speaker==='user'?'我':'旁白'}</div><div className="story-dialogue__body"><RichContent blocks={view.page.blocks} showSources={false}/></div><nav className="story-dialogue__nav"><button disabled={view.index===0} onClick={()=>void load(view.index-1)}>上一页</button><span>此处不会写入经历或改变活动档</span><span>{view.index+1} / {view.total}</span><button disabled={view.index+1>=view.total} onClick={()=>void load(view.index+1)}>下一页</button></nav></div>}</section>
}
