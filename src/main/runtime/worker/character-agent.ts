import {runCharacterAgent} from '../character-agent'
import type {CharacterWorkerInput} from '../../modules/story/home-service'
process.on('message',(input:CharacterWorkerInput&{skill:string})=>{const controller=new AbortController();void runCharacterAgent({...input,signal:controller.signal}).then(result=>process.send?.({ok:true,result}),error=>process.send?.({ok:false,error:error instanceof Error?error.message:'RUNTIME_UNAVAILABLE'}))})
