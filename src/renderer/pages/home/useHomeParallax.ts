import { useEffect, useRef } from 'react'
import { normalizeHomePointer } from './motion'

/** Update transform inputs at most once per frame, without rerendering the home tree. */
export function useHomeParallax(enabled: boolean) {
  const ref = useRef<HTMLElement>(null)
  useEffect(()=>{
    const root=ref.current
    if(!root)return
    let frame=0
    let active=true
    let target={x:0,y:0}
    const apply=()=>{
      frame=0
      if(!active)return
      root.style.setProperty('--home-pointer-x',String(target.x))
      root.style.setProperty('--home-pointer-y',String(target.y))
    }
    const reset=()=>{target={x:0,y:0};cancelAnimationFrame(frame);apply()}
    reset()
    if(!enabled)return
    const move=(event:PointerEvent)=>{
      if(event.pointerType!=='mouse')return
      target=normalizeHomePointer(event.clientX,event.clientY,root.getBoundingClientRect())
      if(!frame)frame=requestAnimationFrame(apply)
    }
    const visibility=()=>{if(document.hidden)reset()}
    root.addEventListener('pointermove',move)
    root.addEventListener('pointerleave',reset)
    root.addEventListener('pointercancel',reset)
    window.addEventListener('blur',reset)
    window.addEventListener('resize',reset)
    document.addEventListener('visibilitychange',visibility)
    return ()=>{
      active=false;cancelAnimationFrame(frame)
      root.style.setProperty('--home-pointer-x','0');root.style.setProperty('--home-pointer-y','0')
      root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',reset);root.removeEventListener('pointercancel',reset)
      window.removeEventListener('blur',reset);window.removeEventListener('resize',reset)
      document.removeEventListener('visibilitychange',visibility)
    }
  },[enabled])
  return ref
}
