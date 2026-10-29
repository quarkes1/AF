import {describe,expect,it} from 'vitest'
import {builtInCompanion,blankCompanion,copyCompanion,validateCompanion,decodeCompanion,encodeCompanion} from '../../src/renderer/pages/companions/model'
describe('companion frontend templates',()=>{
  it.each(['constructor','toString','valueOf','hasOwnProperty'])('rejects inherited object keys as sprite IDs: %s',id=>{
    const data=JSON.parse(encodeCompanion(builtInCompanion));data.template.poses=[{id,label:'自设'}];data.template.defaultPose=id;data.template.sprites={}
    expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
  })
  it('renames reference tags and round-trips more than six poses with a user-selected default',()=>{
    const copy=copyCompanion(builtInCompanion,'custom')
    copy.poses[0].label='平静';copy.poses.push({id:'custom-reading',label:'阅读'})
    copy.sprites['custom-reading']=copy.sprites['01-neutral'];copy.defaultPose='custom-reading'
    const imported=decodeCompanion(encodeCompanion(copy),'imported')
    expect(imported.poses).toHaveLength(7);expect(imported.poses[0].label).toBe('平静')
    expect(imported.defaultPose).toBe('custom-reading');expect(imported.sprites['custom-reading']).toBeTruthy()
    expect(builtInCompanion.poses[0].label).toBe('日常')
  })
  it('migrates old six-pose packages without dropping artwork',()=>{
    const data=JSON.parse(encodeCompanion(builtInCompanion));data.version=1;delete data.template.poses;delete data.template.defaultPose
    const migrated=decodeCompanion(JSON.stringify(data),'old')
    expect(migrated.poses).toHaveLength(6);expect(migrated.defaultPose).toBe('01-neutral')
    expect(migrated.sprites).toEqual(builtInCompanion.sprites)
  })
  it('rejects duplicate IDs, empty labels, orphan artwork and missing default poses',()=>{
    const data=JSON.parse(encodeCompanion(builtInCompanion))
    data.template.poses.push({...data.template.poses[0]});expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
    data.template.poses.pop();data.template.poses[0].label=' ';expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
    data.template.poses[0].label='日常';data.template.defaultPose='unknown';expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
    data.template.defaultPose='01-neutral';data.template.sprites.unknown=data.template.sprites['01-neutral'];expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
  })
  it('copies a preset without changing its identity or artwork',()=>{
    const copy=copyCompanion(builtInCompanion,'local-copy')
    expect(copy.id).toBe('local-copy');expect(copy.builtIn).toBe(false)
    expect(copy.sprites['01-neutral']).toEqual(builtInCompanion.sprites['01-neutral'])
    copy.personality='用户自己的设定'
    expect(builtInCompanion.personality).not.toBe(copy.personality)
  })
  it('permits incomplete drafts but requires name/personality/neutral sprite before usable save',()=>{
    const draft=blankCompanion('local-draft')
    expect(validateCompanion(draft,true)).toBeNull()
    expect(validateCompanion(draft,false)).toBeTruthy()
    expect(validateCompanion({...draft,name:'新伙伴',personality:'喜欢一起研究问题',sprites:{'01-neutral':builtInCompanion.sprites['01-neutral']}},false)).toBeNull()
  })
  it('rejects aggregate artwork that cannot round-trip through the 64MB import limit',()=>{
    const image='data:image/png;base64,'+'A'.repeat(5*1024*1024)
    const value={...builtInCompanion,poses:Array.from({length:13},(_,i)=>({id:`pose-${i}`,label:`标签 ${i}`})),defaultPose:'pose-0',sprites:Object.fromEntries(Array.from({length:13},(_,i)=>[`pose-${i}`,image]))}
    expect(validateCompanion(value,false)).toContain('64MB')
  })
  it('round-trips preview export while assigning a new local id and rejecting remote images or executable fields',()=>{
    const copy=copyCompanion(builtInCompanion,'copy')
    const imported=decodeCompanion(encodeCompanion(copy),'imported')
    expect(imported.id).toBe('imported');expect(imported.builtIn).toBe(false);expect(imported.name).toBe(copy.name)
    const data=JSON.parse(encodeCompanion(copy));data.template.sprites['01-neutral']='https://example.com/image.png'
    expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
    data.template.script='execute';expect(()=>decodeCompanion(JSON.stringify(data),'bad')).toThrow()
  })
})
