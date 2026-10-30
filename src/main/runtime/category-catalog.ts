import {z} from 'zod'
import type {CourseRecord} from '../../shared/contracts/materials'

const querySchema=z.object({query:z.string().max(1200).optional(),courseIds:z.array(z.string()).max(20).optional(),offset:z.number().int().min(0).optional(),limit:z.number().int().min(1).max(10).optional()}).strict()
type CatalogEntry=CourseRecord&{examples?:{documentId:string;summary:string;topics:string[];materialType:string;categoryBasis:string}[]}
/** Never inject the whole library into a model request. Paginate rich scope and allow topic/name lookup. */
export function readCategoryCatalog(catalog:CatalogEntry[],input:unknown){
 const {query='',courseIds,offset=0,limit=5}=querySchema.parse(input)
 const terms=query.normalize('NFKC').toLocaleLowerCase().split(/[\s,，、;；]+/).filter(Boolean)
 const matching=catalog.filter(c=>{
  if(courseIds&&!courseIds.includes(c.id))return false
  const text=JSON.stringify([c.name,c.aliases,c.examples]).normalize('NFKC').toLocaleLowerCase()
  return !terms.length||terms.some(term=>text.includes(term))
 })
 const courses=[]
 for(const c of matching.slice(offset,offset+limit)){
  const value={id:c.id,name:c.name,aliases:c.aliases.slice(0,12),examples:(c.examples??[]).slice(0,2).map(e=>({...e,summary:e.summary.slice(0,180),topics:e.topics.slice(0,8)}))}
  if(courses.length&&Buffer.byteLength(JSON.stringify([...courses,value]))>10000)break
  courses.push(value)
 }
 const next=offset+courses.length
 return{courses,totalMatches:matching.length,nextOffset:next<matching.length?next:null}
}
