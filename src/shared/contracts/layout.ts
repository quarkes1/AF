import type {RichBlock} from './experience'
export interface LayoutRequest{blocks:RichBlock[];mode:'story'|'learning';width:number;height:number;fontScale:number;capture?:boolean}
export interface LayoutReport{ok:boolean;fontReady:boolean;viewport:{width:number;height:number;fontScale:number};blocks:{index:number;width:number;height:number;requiresHorizontalScroll:boolean}[];diagnostics:string[];previewRef?:string}
