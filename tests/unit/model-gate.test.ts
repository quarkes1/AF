import {it,expect,vi} from 'vitest'
import {ModelGate} from '../../src/main/runtime/model-gate'
it('shares two model slots, prioritizes queued foreground work and releases cancelled scopes',async()=>{
 const gate=new ModelGate(2),first=new AbortController(),signal=new AbortController().signal,order:string[]=[]
 let release:(()=>void)|undefined
 const a=gate.run(first.signal,()=>new Promise<void>(()=>{}));const stopped=a.catch(e=>e.message)
 const b=gate.run(signal,()=>new Promise<void>(r=>{release=r}))
 const background=gate.run(signal,async()=>{order.push('background')}),foreground=gate.run(signal,async()=>{order.push('foreground')},1)
 await vi.waitFor(()=>expect(release).not.toBeUndefined());first.abort();expect(await stopped).toBe('CANCELLED')
 await foreground;await background;expect(order).toEqual(['foreground','background']);release!();await b
})
