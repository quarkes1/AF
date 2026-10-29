/** Restore focus once the destination has left its hidden transition. User input cancels it. */
export function focusWhenVisible(resolve:()=>HTMLElement|null,restored?:()=>void){
  let frame=0,stopped=false
  const stop=()=>{stopped=true;cancelAnimationFrame(frame);document.removeEventListener('pointerdown',stop,true);document.removeEventListener('keydown',stop,true)}
  const focus=()=>{
    if(stopped)return
    const target=resolve()
    if(!target?.isConnected){stop();return}
    if(getComputedStyle(target).visibility!=='hidden'&&!target.closest('[inert]')){
      target.focus({preventScroll:true})
      if(document.activeElement===target){stop();restored?.();return}
    }
    frame=requestAnimationFrame(focus)
  }
  document.addEventListener('pointerdown',stop,true);document.addEventListener('keydown',stop,true)
  frame=requestAnimationFrame(focus);return stop
}
