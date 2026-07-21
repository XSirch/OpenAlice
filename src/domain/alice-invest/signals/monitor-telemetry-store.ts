import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { MonitorCapability } from './monitor-runner.js'

const eventSchema=z.object({id:z.string().uuid(),at:z.string().datetime({offset:true}),kind:z.enum(['gap','crossing','stale','outage']),capability:z.enum(['b3_signals','crypto_signals']).optional(),signalId:z.string().max(128).optional(),details:z.string().max(256).optional()}).strict()
export type MonitorTelemetryEvent=z.infer<typeof eventSchema>
const fileSchema=z.object({version:z.literal(1),events:z.array(eventSchema).max(10_000)}).strict()
/** Bounded operational facts only; source payloads and credentials never enter this journal. */
export class MonitorTelemetryStore {
  private queue:Promise<void>=Promise.resolve()
  constructor(private readonly path:string){}
  async append(event:MonitorTelemetryEvent):Promise<boolean>{return this.lock(async()=>{const file=await this.read();if(file.events.some(item=>item.id===event.id))return false;file.events.push(event);await this.write(file);return true})}
  async list():Promise<MonitorTelemetryEvent[]>{return[...(await this.read()).events]}
  private lock<T>(fn:()=>Promise<T>):Promise<T>{const run=this.queue.then(fn,fn);this.queue=run.then(()=>undefined,()=>undefined);return run}
  private async read(){try{return fileSchema.parse(JSON.parse(await readFile(this.path,'utf8')))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{version:1 as const,events:[]};throw error}}
  private async write(file:{version:1;events:MonitorTelemetryEvent[]}){await mkdir(dirname(this.path),{recursive:true});const temp=`${this.path}.tmp-${process.pid}`;await writeFile(temp,`${JSON.stringify(file)}\n`,{mode:0o600});await rename(temp,this.path);await chmod(this.path,0o600).catch(()=>undefined)}
}
export function monitorTelemetryId(input:Pick<MonitorTelemetryEvent,'at'|'kind'|'capability'|'signalId'>):string{const text=JSON.stringify(input);let hash=0;for(let i=0;i<text.length;i+=1)hash=((hash<<5)-hash)+text.charCodeAt(i)|0;const hex=(hash>>>0).toString(16).padStart(8,'0');return `${hex}-0000-4000-8000-000000000000`}
