import Decimal from 'decimal.js'
import type { SignalLedgerEvent } from './ledger.js'
export interface MonitorInput{event:SignalLedgerEvent;now:Date;price:string;capabilityReady:boolean;marketOpen:boolean}
export interface MonitorResult{action:'none'|'invalidated'|'expired';reason?:string}
/** One scheduled-tick decision. The caller appends an event only for a non-none result. */
export function monitorSignal(input:MonitorInput):MonitorResult{if(!input.capabilityReady||!input.marketOpen)return{action:'none'};if(input.event.type!=='created')return{action:'none'};if(input.now.getTime()>=Date.parse(input.event.candidate.validUntil))return{action:'expired',reason:'signal validity expired'};if(new Decimal(input.price).lte(input.event.candidate.stopPrice))return{action:'invalidated',reason:'stop price reached'};return{action:'none'}}
