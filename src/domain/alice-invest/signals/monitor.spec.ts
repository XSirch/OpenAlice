import { describe, expect, it } from 'vitest'
import { monitorSignal, monitorTransition, persistMonitorTransition } from './monitor.js'

const event={eventId:'e',signalId:'s',type:'created' as const,at:'2026-07-16T12:00:00.000Z',candidate:{strategyId:'x',strategyVersion:'1',symbol:'BTC/USDT',observations:[{symbol:'BTC/USDT',source:'x',sourceTimestamp:'2026-07-16T12:00:00.000Z',receivedAt:'2026-07-16T12:00:00.000Z',capability:'realtime' as const,close:'10'}],targetPrice:'12',stopPrice:'9',validUntil:'2026-07-16T13:00:00.000Z',riskNotes:[],status:'eligible' as const}}
const input=(price?:string)=>({event,now:new Date('2026-07-16T12:10:00Z'),price,capabilityReady:true,marketOpen:true})

describe('signal monitor',()=>{
  it('fails closed and only evaluates an active signal once',()=>{
    expect(monitorSignal(input('9'))).toMatchObject({action:'stop_hit'})
    expect(monitorSignal({...input('1'),event:{...event,type:'invalidated'}}).action).toBe('none')
    expect(monitorSignal({...input('1'),capabilityReady:false}).action).toBe('none')
    expect(monitorSignal(input()).action).toBe('none')
  })
  it('records activation before later terminal lifecycle transitions',()=>{
    const active=monitorSignal(input('10'))
    expect(active).toMatchObject({action:'active'})
    expect(monitorSignal({...input('12'),event:{...event,type:'active'}})).toMatchObject({action:'target_hit'})
  })
  it('records a deterministic target transition',()=>{
    const result=monitorSignal(input('12'))
    expect(result).toMatchObject({action:'target_hit'})
    expect(monitorTransition(input('12'),result)).toMatchObject({type:'target_hit',price:'12'})
    expect(monitorTransition(input('12'),result)).toEqual(monitorTransition(input('12'),result))
  })
  it('activates and only raises the trailing stop',()=>{
    const activated=monitorSignal({...input('11'),trailingActivationPrice:'11',trailingDistance:'1'})
    expect(activated).toMatchObject({action:'trailing_activated',trailingStop:'10'})
    const advanced={...event,type:'trailing_activated' as const,trailingStop:'10'}
    expect(monitorSignal({...input('10.5'),event:advanced,trailingActivationPrice:'11',trailingDistance:'1'}).action).toBe('none')
    expect(monitorSignal({...input('11.5'),event:advanced,trailingActivationPrice:'11',trailingDistance:'1'})).toMatchObject({action:'trailing_updated',trailingStop:'10.5'})
  })
  it('expires only while its market is supervised',()=>{
    expect(monitorSignal({...input('10'),now:new Date('2026-07-16T14:00:00Z')}).action).toBe('expired')
    expect(monitorSignal({...input('10'),now:new Date('2026-07-16T14:00:00Z'),marketOpen:false}).action).toBe('none')
  })
  it('persists the transition idempotently before it can be delivered',async()=>{
    const entries:unknown[]=[]
    const ledger={append:async(entry:unknown)=>{const duplicate=entries.some(existing=>JSON.stringify(existing)===JSON.stringify(entry));if(!duplicate)entries.push(entry);return{event:entry as never,duplicate}}}
    expect(await persistMonitorTransition(input('12'),ledger)).toMatchObject({action:'target_hit',duplicate:false})
    expect(await persistMonitorTransition(input('12'),ledger)).toMatchObject({action:'target_hit',duplicate:true})
  })
})
