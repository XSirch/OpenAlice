import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SignalCandidate } from './contracts.js'
export type SignalLifecycle='created'|'active'|'target_hit'|'stop_hit'|'expired'|'invalidated'|'trailing_activated'|'trailing_updated'
export interface SignalLedgerEvent { eventId:string; signalId:string; type:SignalLifecycle; at:string; candidate:SignalCandidate; reason?:string; price?:string; trailingStop?:string }
interface LedgerFile { version:1; events:SignalLedgerEvent[] }
export class SignalLedger {
  private queue:Promise<void>=Promise.resolve()
  constructor(private readonly path:string) {}
  async append(event:SignalLedgerEvent):Promise<{event:SignalLedgerEvent;duplicate:boolean}>{return this.lock(async()=>{const file=await this.read();const old=file.events.find(x=>x.eventId===event.eventId);if(old)return{event:old,duplicate:true};file.events.push(event);await this.write(file);return{event,duplicate:false}})}
  async current():Promise<Map<string,SignalLedgerEvent>>{const out=new Map<string,SignalLedgerEvent>();for(const event of (await this.read()).events)out.set(event.signalId,event);return out}
  private lock<T>(fn:()=>Promise<T>):Promise<T>{const run=this.queue.then(fn,fn);this.queue=run.then(()=>undefined,()=>undefined);return run}
  private async read():Promise<LedgerFile>{try{const f=JSON.parse(await readFile(this.path,'utf8')) as LedgerFile;if(f.version!==1||!Array.isArray(f.events))throw new Error('Invalid signal ledger');return f}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return{version:1,events:[]};throw e}}
  private async write(f:LedgerFile){await mkdir(dirname(this.path),{recursive:true});const temp=`${this.path}.tmp`;await writeFile(temp,`${JSON.stringify(f,null,2)}\n`,{mode:0o600});await rename(temp,this.path);await chmod(this.path,0o600).catch(()=>undefined)}
}
