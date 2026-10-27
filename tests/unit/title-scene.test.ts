import { describe, expect, it } from 'vitest'
import { titlePeriodAt } from '../../src/renderer/features/startup/title-scene/time'
import { createResourceCatalog } from '../../src/renderer/app/resources'

describe('local-time title scene',()=>{
  it.each([[0,'night'],[5,'night'],[6,'day'],[16,'day'],[17,'dusk'],[18,'dusk'],[19,'night'],[23,'night']] as const)('selects %s:00 as %s', (hour,expected)=>{
    expect(titlePeriodAt(new Date(2026,9,27,hour,0))).toBe(expected)
  })
  it('defaults safely for an invalid system date',()=>expect(titlePeriodAt(new Date(NaN))).toBe('day'))
  it('keeps new art out of the normal catalog and permits only explicitly requested review IDs',()=>{
    const art=[{id:'review.one',file:'one.png',status:'review'},{id:'review.other',file:'other.png',status:'review'}]
    expect(createResourceCatalog(art,'https://local/').has('review.one')).toBe(false)
    const review=createResourceCatalog(art,'https://local/',['review.one'])
    expect(review.has('review.one')).toBe(true);expect(review.has('review.other')).toBe(false)
  })
})
