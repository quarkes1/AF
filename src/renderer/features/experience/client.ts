import type {ChatScope} from '../../../shared/contracts/home-chat'
import {StoryClient,StoryClientError} from '../../pages/saves/backend-client'
export async function experienceCall<T=any>(client:StoryClient,scope:ChatScope,command:string,payload:Record<string,unknown>={},intent?:string):Promise<T>{
 const read=command.endsWith('.get')||['story.buffer.status','story.history','save.checkpoints','save.replay'].includes(command),key=read?undefined:intent??crypto.randomUUID()
 const targetScope=command==='save.get'?undefined:scope
 try{return await client.call<T>(command,payload,targetScope,key)}catch(error){if(!(error instanceof StoryClientError)||error.code!=='STALE_STATE')throw error;if(command.startsWith('jobs.'))await client.call('jobs.get',{jobId:payload.jobId},scope);else await client.call('save.get',{saveId:scope.saveId});return client.call<T>(command,payload,targetScope,key)}
}
