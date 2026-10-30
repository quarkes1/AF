export type MaterialKind='document'|'background'|'music'
export interface ContentBlock{id:string;page:number;text:string;kind:'paragraph'|'heading'|'table'|'image'|'formula';quality:'native'|'ocr'|'review';imageId?:string}
export interface CourseRecord{id:string;name:string;aliases:string[];stateVersion:number;textbook:TextbookState|null}
export interface MaterialContentProfile{suggestedCategory:string;categoryBasis:'course'|'topic';materialType:string;summary:string;topics:string[];evidenceBlockIds:string[];reason:string}
export interface TextbookCandidate{id:string;title:string;author:string|null;publisher:string|null;edition:string|null;isbn:string|null;evidenceBlockIds:string[];evidenceInputIds?:string[];confidence:'explicit'|'partial'|'similar'}
export interface TextbookState{status:'candidate'|'questioning'|'confirmed'|'inferred'|'generic';round:number;question:string|null;candidates:TextbookCandidate[];selectedId:string|null;chapterMapVersion:number;documentIds?:string[];chapters:{title:string;blockIds:string[]}[]}
export interface MaterialRecord{
  id:string;kind:MaterialKind;name:string;filename:string;extension:string;mime:string;size:number;addedAt:number;updatedAt:number
  subject:string;textbook:string;chapter:string;position:number;width?:number;height?:number;duration?:number
  courseIds:string[];manualOverride:boolean;state:'queued'|'parsing'|'ready'|'partial'|'failed'|'needs_review';error:string|null;blocks:number;classificationEvidence:string[];fingerprint:string;stateVersion:number
  sourceVersion?:number;previousVersionId?:string
  contentProfile?:MaterialContentProfile
}
export interface MaterialJob{id:string;purpose:'parse'|'resourceClassify'|'courseNameReview'|'textbookIdentify'|'providerTest'|'scan'|'import';status:'queued'|'running'|'waiting_user'|'completed'|'failed'|'cancelled'|'superseded';documentIds:string[];error:string|null;completed:number;total:number;createdAt:number;contextHash?:string;result?:unknown}
export interface MaterialSnapshot{items:MaterialRecord[];courses:CourseRecord[];jobs:MaterialJob[];provider:{configured:boolean;model:string;baseUrl:string};stateVersion:number}
export interface NameReview{name:string;existing:CourseRecord|null;reason:string;reviewed:boolean}
export interface BackendRequest{protocolVersion:1;requestId:string;command:string;target:{kind:'resource'|'course'|'provider'|'job'|'profile';id:string|null};saveId:null;branchId:null;expectedStateVersion:number|null;idempotencyKey:string|null;payload:unknown}
export type BackendResponse={protocolVersion:1;requestId:string;ok:true;stateVersion:number;data:unknown}|{protocolVersion:1;requestId:string;ok:false;stateVersion:number|null;error:{code:string;message:string;retryable:boolean;detailsRef:null}}
export interface MaterialsBridge{request(request:BackendRequest):Promise<BackendResponse>}
