import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createMemoryInboxStore } from '../../../core/inbox-store.js'
import { SignalLedger } from './ledger.js'
import { MonitorDeliveryStore } from './monitor-delivery-store.js'
import { runSignalMonitorTick } from './monitor-runner.js'

const event={eventId:'created',signalId:'signal',type:'created' as const,at:'2026-07-16T12:00:00.000Z',candidate:{strategyId:'x',strategyVersion:'1',symbol:'PETR4',observations:[{symbol:'PETR4',source:'fixture',sourceTimestamp:'2026-07-16T12:00:00.000Z',receivedAt:'2026-07-16T12:00:00.000Z',capability:'realtime' as const,close:'10'}],targetPrice:'12',stopPrice:'9',validUntil:'2026-07-16T13:00:00.000Z',riskNotes:[],status:'eligible' as const}}
const base={now:new Date('2026-07-16T12:10:00.000Z'),enabled:true,notificationsEnabled:true,readiness:{b3_signals:'paper_alerts' as const,crypto_signals:'research_only' as const},b3MarketOpen:true,maxAgeSeconds:30}

describe('signal monitor runner',()=>{
  it('persists before Inbox delivery and recovers duplicate ticks without duplicate delivery',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'monitor-runner-'));try{
      const ledger=new SignalLedger(join(dir,'ledger.json')), inbox=createMemoryInboxStore(), deliveries=new MonitorDeliveryStore(join(dir,'deliveries.json'))
      const input={...base,signals:[{capability:'b3_signals' as const,event,price:'12',sourceTimestamp:'2026-07-16T12:09:55.000Z',workspaceId:'workspace'}]}
      expect(await runSignalMonitorTick(input,ledger,inbox,deliveries)).toMatchObject([{action:'target_hit',delivered:true}])
      expect(await runSignalMonitorTick(input,ledger,inbox,deliveries)).toMatchObject([{action:'target_hit',delivered:false}])
      expect((await ledger.current()).get('signal')).toMatchObject({type:'target_hit'})
      expect((await inbox.read()).entries).toHaveLength(1)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('uses stop-first policy for an ambiguous candle and isolates a blocked capability',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'monitor-runner-'));try{
      const ledger=new SignalLedger(join(dir,'ledger.json')), inbox=createMemoryInboxStore(), deliveries=new MonitorDeliveryStore(join(dir,'deliveries.json'))
      const outcomes=await runSignalMonitorTick({...base,signals:[
        {capability:'b3_signals',event,low:'8',high:'13',sourceTimestamp:'2026-07-16T12:09:55.000Z',workspaceId:'workspace'},
        {capability:'crypto_signals',event:{...event,signalId:'crypto'},price:'12',sourceTimestamp:'2026-07-16T12:09:55.000Z',workspaceId:'workspace'},
      ]},ledger,inbox,deliveries)
      expect(outcomes).toMatchObject([{action:'invalidated',delivered:true},{action:'target_hit',delivered:false}])
      expect(outcomes[0]?.reason).toContain('stop-first')
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('fails closed for stale, absent, or closed-market observations',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'monitor-runner-'));try{
      const ledger=new SignalLedger(join(dir,'ledger.json')), inbox=createMemoryInboxStore(), deliveries=new MonitorDeliveryStore(join(dir,'deliveries.json'))
      const outcomes=await runSignalMonitorTick({...base,b3MarketOpen:false,signals:[
        {capability:'b3_signals',event,price:'12',sourceTimestamp:'2026-07-16T12:00:00.000Z',workspaceId:'workspace'},
        {capability:'crypto_signals',event:{...event,signalId:'missing'},sourceTimestamp:'2026-07-16T12:09:55.000Z',workspaceId:'workspace'},
      ]},ledger,inbox,deliveries)
      expect(outcomes.map(x=>x.action)).toEqual(['none','none'])
    }finally{await rm(dir,{recursive:true,force:true})}
  })
  it('retries delivery after a restart without writing a second lifecycle event',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'monitor-runner-'));try{
      const ledger=new SignalLedger(join(dir,'ledger.json')), deliveries=new MonitorDeliveryStore(join(dir,'deliveries.json'))
      let failures=1, entries=0
      const inbox={append:async()=>{if(failures-- > 0)throw new Error('503');entries+=1;return{id:'inbox',ts:0,workspaceId:'workspace',comments:'delivered'}},read:async()=>({entries:[],hasMore:false}),get:async()=>null,markRead:async()=>false,markUnread:async()=>false,delete:async()=>false,onAppended:()=>()=>undefined,onRemoved:()=>()=>undefined}
      const input={...base,signals:[{capability:'b3_signals' as const,event,price:'12',sourceTimestamp:'2026-07-16T12:09:55.000Z',workspaceId:'workspace'}]}
      await expect(runSignalMonitorTick(input,ledger,inbox,deliveries)).rejects.toThrow('503')
      expect(await runSignalMonitorTick(input,ledger,inbox,deliveries)).toMatchObject([{action:'target_hit',delivered:true}])
      expect(entries).toBe(1)
    }finally{await rm(dir,{recursive:true,force:true})}
  })
})
