// Format conversion only: preserve the approved artwork, without cropping or redrawing.
const {app,nativeImage}=require('electron')
const {readFileSync,writeFileSync}=require('node:fs')
const {resolve}=require('node:path')
const {createHash}=require('node:crypto')

app.whenReady().then(()=>{
  const directory=resolve(__dirname,'../assets/brand/app-icon')
  const source=nativeImage.createFromPath(resolve(directory,'aurore-source.png'))
  const original=source.getSize()
  if(source.isEmpty()||original.width!==original.height)throw new Error('Expected the approved square Aurore source')
  const sizes=[16,24,32,48,64,128,256]
  const frames=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG())
  const header=Buffer.alloc(6+16*sizes.length)
  header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4)
  let offset=header.length
  frames.forEach((frame,index)=>{
    const entry=6+16*index,size=sizes[index]
    header[entry]=size===256?0:size;header[entry+1]=header[entry]
    header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6)
    header.writeUInt32LE(frame.length,entry+8);header.writeUInt32LE(offset,entry+12)
    offset+=frame.length
  })
  writeFileSync(resolve(directory,'aurore.ico'),Buffer.concat([header,...frames]))
  writeFileSync(resolve(directory,'aurore-256.png'),frames.at(-1))
  writeFileSync(resolve(directory,'aurore-32.png'),frames[2])
  const files=['aurore-source.png','aurore-256.png','aurore-32.png','aurore.ico']
  const manifest={schemaVersion:1,name:'Aurore application icon',status:'approved',approvedOn:'2026-10-28',description:'SD Aurore, wink and inward V-sign, raised elbow; user-approved final artwork.',source:'Built-in image_gen; original Aurore character art with user-provided style and pose references.',license:'LicenseRef-AF-Project-Art',role:'Application/window/taskbar/favicon artwork; AF wordmark remains unchanged.',icoSizes:sizes,files:files.map(file=>{const bytes=readFileSync(resolve(directory,file));return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}})}
  writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
  console.log(`Prepared Aurore PNG and ICO (${sizes.join(', ')}px) from ${original.width}px source.`)
  app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
