export interface CharacterContent{
 name:string;sourceKind:'original'|'existing';sourceWork:string;personality:string;partnerIdentity:string;userIdentity:string;address:string;background:string;knowledge:string;speech:string;relationship:string;initiative:string;immutable:string;events:string
 poses:{id:string;label:string}[];defaultPose:string;sprites:Partial<Record<string,string>>;examples:boolean
}
export interface CharacterTemplate{id:string;builtIn:boolean;templateVersion:number;content:CharacterContent;draft:boolean;createdAt:string;updatedAt:string}
export interface StoryRecord{id:string;name:string;branchId:string;characterTemplateId:string;characterTemplateVersion:number;characterSnapshot:CharacterTemplate;worldSetting:{mode:'realWorld'|'custom';description:string};partnerIdentity:string;userIdentity:string;relationshipStart:string;courseIds:string[];stateVersion:number;contextRevision:number;homeContextRevision?:number;createdAt:string;updatedAt:string;chapter:string;chapterName:string;lastLine:string;activeActId?:string|null;activeScriptRevision?:number;learningSessionId?:string|null}
export type StorySummary=Omit<StoryRecord,'characterSnapshot'>&{partnerName:string}
export type StorySelection={kind:'template';templateId:string}|{kind:'save';saveId:string;branchId:string}
export interface StoryRequest{protocolVersion:1;requestId:string;command:string;target:{kind:'template'|'save'|'selection'|'profile'|'job';id:string|null};saveId:string|null;branchId:string|null;expectedStateVersion:number|null;idempotencyKey:string|null;payload:unknown}
export type StoryResponse={protocolVersion:1;requestId:string;ok:true;stateVersion:number;data:unknown}|{protocolVersion:1;requestId:string;ok:false;stateVersion:number|null;error:{code:string;message:string;retryable:boolean;detailsRef:null}}
export interface StoryBridge{request(request:StoryRequest):Promise<StoryResponse>}
export interface LearningProgressSummary{courseId:string;chapterId:string;chapterMapVersion:number;learningSessionId:string;read:boolean;attempts:number;independentCorrect:number;state:string}
