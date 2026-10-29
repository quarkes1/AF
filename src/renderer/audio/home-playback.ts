export interface HomePlayback {id:string;playing:boolean;loading:boolean;currentTime:number;duration:number}
export const EMPTY_HOME_PLAYBACK:HomePlayback={id:'bgm.home.suno-01',playing:false,loading:false,currentTime:0,duration:0}
export function formatMusicTime(seconds:number){if(!Number.isFinite(seconds)||seconds<0)return '--:--';const value=Math.floor(seconds);return `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`}
