import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

interface DeliveryFile { version: 1; deliveredEventIds: string[] }

/** Durable receipt journal for Inbox delivery. Ledger remains the source of truth. */
export class MonitorDeliveryStore {
  private queue: Promise<void> = Promise.resolve()
  constructor(private readonly path: string) {}
  async wasDelivered(eventId: string): Promise<boolean> { return (await this.read()).deliveredEventIds.includes(eventId) }
  async markDelivered(eventId: string): Promise<boolean> { return this.lock(async()=>{
    const file=await this.read()
    if(file.deliveredEventIds.includes(eventId))return false
    file.deliveredEventIds.push(eventId)
    await this.write(file)
    return true
  }) }
  private lock<T>(fn:()=>Promise<T>):Promise<T>{const run=this.queue.then(fn,fn);this.queue=run.then(()=>undefined,()=>undefined);return run}
  private async read():Promise<DeliveryFile>{try{const value=JSON.parse(await readFile(this.path,'utf8')) as DeliveryFile;if(value.version!==1||!Array.isArray(value.deliveredEventIds)||value.deliveredEventIds.some(id=>typeof id!=='string'))throw new Error('Invalid monitor delivery journal');return value}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{version:1,deliveredEventIds:[]};throw error}}
  private async write(file:DeliveryFile):Promise<void>{await mkdir(dirname(this.path),{recursive:true});const temporary=`${this.path}.tmp-${process.pid}`;await writeFile(temporary,`${JSON.stringify(file)}\n`,{mode:0o600});await rename(temporary,this.path);await chmod(this.path,0o600).catch(()=>undefined)}
}
