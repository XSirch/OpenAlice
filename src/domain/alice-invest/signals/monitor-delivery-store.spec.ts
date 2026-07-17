import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { MonitorDeliveryStore } from './monitor-delivery-store.js'

describe('monitor delivery store',()=>it('persists idempotent delivery receipts across restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'monitor-delivery-'));try{
    const path=join(dir,'deliveries.json'), first=new MonitorDeliveryStore(path)
    expect(await first.markDelivered('event')).toBe(true)
    expect(await first.markDelivered('event')).toBe(false)
    expect(await new MonitorDeliveryStore(path).wasDelivered('event')).toBe(true)
  }finally{await rm(dir,{recursive:true,force:true})}
}))
