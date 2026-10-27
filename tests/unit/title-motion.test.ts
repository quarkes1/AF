import { describe, expect, it } from 'vitest'
import { TITLE_MOTION } from '../../src/renderer/features/startup/title-scene/motion'

describe('more visible title atmosphere',()=>{
  it('moves clouds substantially faster than the original 100px over 70 seconds',()=>{
    const speed=TITLE_MOTION.cloudTravel*2/(TITLE_MOTION.cloudCycle/2)
    expect(speed/(100/70)).toBeGreaterThanOrEqual(3.5)
    expect(TITLE_MOTION.windScale).toBeGreaterThan(3.2)
  })
  it('keeps the stronger foliage motion above buildings and protects the cupola',()=>{
    expect(TITLE_MOTION.canopyFadeEnd).toBeLessThanOrEqual(270)
    const box=TITLE_MOTION.architectureHoldout
    expect(box.x).toBeLessThan(950);expect(box.y).toBeLessThan(100)
    expect(box.x+box.width).toBeGreaterThan(1280);expect(box.y+box.height).toBeGreaterThan(300)
  })
})
