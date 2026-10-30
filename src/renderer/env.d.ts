import type {MaterialsBridge} from '../shared/contracts/materials'
import type {StoryBridge} from '../shared/contracts/story'
declare global{interface Window{afMaterials?:MaterialsBridge;afStory?:StoryBridge}}
