import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import type { SignalLedger, SignalLedgerEvent } from './ledger.js'
export interface MonitorInput{event:SignalLedgerEvent;now:Date;price?:string;capabilityReady:boolean;marketOpen:boolean;trailingActivationPrice?:string;trailingDistance?:string}
export interface MonitorResult{action:'none'|'invalidated'|'expired'|'target_hit'|'trailing_activated'|'trailing_updated';reason?:string;trailingStop?:string}
/** One scheduled-tick decision. The caller appends an event only for a non-none result. */
export function monitorSignal(input:MonitorInput):MonitorResult{
  if(!input.capabilityReady||!input.marketOpen)return{action:'none'}
  if(input.event.type!=='created'&&input.event.type!=='trailing_activated'&&input.event.type!=='trailing_updated')return{action:'none'}
  if(input.now.getTime()>=Date.parse(input.event.candidate.validUntil))return{action:'expired',reason:'signal validity expired'}
  if(!input.price)return{action:'none'}
  const price=new Decimal(input.price), trailingStop=input.event.trailingStop&&new Decimal(input.event.trailingStop), stop=trailingStop??new Decimal(input.event.candidate.stopPrice)
  if(price.lte(stop))return{action:'invalidated',reason:trailingStop?'trailing stop reached':'stop price reached'}
  if(price.gte(input.event.candidate.targetPrice))return{action:'target_hit',reason:'target price reached'}
  if(!input.trailingActivationPrice||!input.trailingDistance)return{action:'none'}
  const activation=new Decimal(input.trailingActivationPrice), distance=new Decimal(input.trailingDistance)
  if(distance.lte(0)||price.lt(activation))return{action:'none'}
  const next=price.minus(distance)
  if(next.lte(stop))return{action:'none'}
  return{action:trailingStop?'trailing_updated':'trailing_activated',reason:trailingStop?'trailing stop increased':'trailing stop activated',trailingStop:next.toFixed()}
}

/** Builds a deterministic, append-safe lifecycle event. A tick never mutates the original signal. */
export function monitorTransition(input:MonitorInput,result:MonitorResult):SignalLedgerEvent|null{
  if(result.action==='none')return null
  const at=input.now.toISOString(), eventId=stableId({signalId:input.event.signalId,type:result.action,at,price:input.price,trailingStop:result.trailingStop})
  return{eventId,signalId:input.event.signalId,type:result.action,at,candidate:input.event.candidate,reason:result.reason,price:input.price,trailingStop:result.trailingStop}
}
/** Evaluates and persists a non-terminal lifecycle transition before any delivery layer can observe it. */
export async function persistMonitorTransition(input:MonitorInput,ledger:Pick<SignalLedger,'append'>):Promise<MonitorResult & {duplicate?:boolean}>{
  const result=monitorSignal(input), transition=monitorTransition(input,result)
  if(!transition)return result
  const appended=await ledger.append(transition)
  return{...result,duplicate:appended.duplicate}
}
function stableId(value:unknown){const hash=createHash('sha256').update(JSON.stringify(value)).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`}
