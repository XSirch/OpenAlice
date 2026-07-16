import Decimal from 'decimal.js'
import { assessObservationFreshness, type NormalizedMarketObservation } from '../market-data/observation.js'
import type { SignalCandidate, SignalObservation } from './contracts.js'

export interface B3StrategyInput { symbol:string; shortTerm: SignalObservation[]; longTerm: SignalObservation[]; now:Date; maxAgeSeconds:number }
/** Transparent v1: bullish short/long SMA crossover. No future observation is read. */
export function evaluateB3TrendStrategy(input:B3StrategyInput): SignalCandidate | null {
  if (input.shortTerm.length < 3 || input.longTerm.length < 5) return null
  const all=[...input.shortTerm,...input.longTerm]
  if (all.some(item=>item.symbol!==input.symbol || !fresh(item,input.now,input.maxAgeSeconds))) return null
  const short=sma(input.shortTerm), long=sma(input.longTerm), latest=new Decimal(input.shortTerm.at(-1)!.close)
  if (!short.gt(long) || !latest.gt(short)) return null
  const source=input.shortTerm.at(-1)!
  return {strategyId:'b3-trend-crossover',strategyVersion:'1',symbol:input.symbol,observations:all,targetPrice:latest.mul('1.02').toFixed(2),stopPrice:latest.mul('0.99').toFixed(2),validUntil:new Date(new Date(source.receivedAt).getTime()+15*60_000).toISOString(),riskNotes:['Informational trend candidate; deterministic risk validation is still required.'],status:'eligible'}
}
function sma(values:SignalObservation[]):Decimal{return values.reduce((sum,item)=>sum.plus(item.close),new Decimal(0)).div(values.length)}
function fresh(value:SignalObservation,now:Date,maxAgeSeconds:number){return assessObservationFreshness(value as NormalizedMarketObservation,maxAgeSeconds,now).fresh}
