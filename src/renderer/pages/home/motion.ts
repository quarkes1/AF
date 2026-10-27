interface Bounds { left: number; top: number; width: number; height: number }
export function normalizeHomePointer(clientX: number, clientY: number, bounds: Bounds) {
  if (![clientX,clientY,bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return {x:0,y:0}
  const clamp = (value: number) => Math.max(-1,Math.min(1,value))
  return { x:clamp((clientX-bounds.left)/bounds.width*2-1), y:clamp((clientY-bounds.top)/bounds.height*2-1) }
}
