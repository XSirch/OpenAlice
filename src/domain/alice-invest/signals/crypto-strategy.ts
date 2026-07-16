import Decimal from 'decimal.js'
import { assessObservationFreshness, type NormalizedMarketObservation } from '../market-data/observation.js'
import type { SignalCandidate, SignalObservation } from './contracts.js'
export interface CryptoStrategyInput { symbol:string; fast:SignalObservation[]; slow:SignalObservation[]; now:Date; maxAgeSeconds:number; spotReadOnly:boolean }
/** Spot-only v1 crossover; it has no derivative, margin or execution path. */
export function evaluateCryptoSpotStrategy(input:CryptoStrategyInput):SignalCandidate|null {
  if(!input.spotReadOnly||input.fast.length<3||input.slow.length<5)return null
  const all=[...input.fast,...input.slow]; if(all.some(x=>x.symbol!==input.symbol||!assessObservationFreshness(x as NormalizedMarketObservation,input.maxAgeSeconds,input.now).fresh))return null
  const avg=(v:SignalObservation[])=>v.reduce((s,x)=>s.plus(x.close),new Decimal(0)).div(v.length); const last=new Decimal(input.fast.at(-1)!.close)
  if(!avg(input.fast).gt(avg(input.slow))||!last.gt(avg(input.fast)))return null
  const latest=input.fast.at(-1)!; return {strategyId:'crypto-spot-crossover',strategyVersion:'1',symbol:input.symbol,observations:all,targetPrice:last.mul('1.02').toFixed(2),stopPrice:last.mul('0.99').toFixed(2),validUntil:new Date(new Date(latest.receivedAt).getTime()+15*60_000).toISOString(),riskNotes:['Spot-only informational candidate; deterministic risk validation is required.'],status:'eligible'}
}
