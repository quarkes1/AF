import { describe, expect, it } from 'vitest'
import { normalizeHomePointer } from '../../src/renderer/pages/home/motion'

describe('bounded home parallax input',()=>{
  const bounds={left:0,top:0,width:1440,height:900}
  it('rests at the viewport center and reaches opposite bounded corners',()=>{
    expect(normalizeHomePointer(720,450,bounds)).toEqual({x:0,y:0})
    expect(normalizeHomePointer(0,0,bounds)).toEqual({x:-1,y:-1})
    expect(normalizeHomePointer(1440,900,bounds)).toEqual({x:1,y:1})
  })
  it('clamps outside coordinates and respects a container offset',()=>{
    expect(normalizeHomePointer(9999,-100,bounds)).toEqual({x:1,y:-1})
    expect(normalizeHomePointer(820,500,{...bounds,left:100,top:50})).toEqual({x:0,y:0})
  })
  it('does not produce movement or NaN for an unmeasured/invalid container',()=>{
    expect(normalizeHomePointer(10,10,{...bounds,width:0})).toEqual({x:0,y:0})
    expect(normalizeHomePointer(Number.NaN,10,bounds)).toEqual({x:0,y:0})
  })
})
