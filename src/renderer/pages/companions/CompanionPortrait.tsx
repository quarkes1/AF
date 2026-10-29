import {useEffect,useState} from 'react'
import type {ResourceCatalog} from '../../app/resources'
import {Icon} from '../../components/Icon'
export function CompanionPortrait({image,resources,name}:{image?:string;resources:ResourceCatalog;name:string}){
  const [failed,setFailed]=useState(false)
  useEffect(()=>setFailed(false),[image])
  const source=image?.startsWith('data:image/png;base64,')?image:image&&resources.has(image)?resources.url(image):null
  return source&&!failed?<img src={source} alt={name} draggable="false" onError={()=>setFailed(true)}/>:<div className="companion-portrait-missing"><Icon name="user" resources={resources}/><span>未添加立绘</span></div>
}
