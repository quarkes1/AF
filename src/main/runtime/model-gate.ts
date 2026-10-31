interface Entry{priority:number;ticket:number;start:()=>void}
export class ModelGate{
 private active=0
 private sequence=0
 private queue:Entry[]=[]
 constructor(private limit=2){}
 run<T>(signal:AbortSignal,operation:()=>Promise<T>,priority=0):Promise<T>{
  if(signal.aborted)return Promise.reject(new Error('CANCELLED'))
  return new Promise<T>((resolve,reject)=>{
   const cancelQueued=()=>{this.queue=this.queue.filter(item=>item!==entry);reject(new Error('CANCELLED'))}
   const entry:Entry={priority,ticket:this.sequence++,start:()=>{
    signal.removeEventListener('abort',cancelQueued)
    if(signal.aborted){reject(new Error('CANCELLED'));this.drain();return}
    this.active++
    let cancel:()=>void=()=>{}
    const aborted=new Promise<never>((_resolve,fail)=>{cancel=()=>fail(new Error('CANCELLED'));signal.addEventListener('abort',cancel,{once:true})})
    void Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return operation()}),aborted]).then(resolve,reject).finally(()=>{signal.removeEventListener('abort',cancel);this.active--;this.drain()})
   }}
   signal.addEventListener('abort',cancelQueued,{once:true});this.queue.push(entry);this.drain()
  })
 }
 private drain(){this.queue.sort((a,b)=>b.priority-a.priority||a.ticket-b.ticket);while(this.active<this.limit&&this.queue.length)this.queue.shift()!.start()}
}
export const modelGate=new ModelGate(2)
