import Decimal from 'decimal.js'
import type { SignalCandidate } from './contracts.js'
export type RiskRejection='stale'|'spread'|'liquidity'|'reward_risk'|'cooldown'|'position_limit'|'derivative_or_leverage'|'execution_requested'
export interface RiskValidationInput { candidate:SignalCandidate; now:Date; maxAgeSeconds:number; spreadPct:string; maxSpreadPct:string; liquidityBRL:string; minimumLiquidityBRL:string; cooldownActive:boolean; positionLimitReached:boolean; derivatives:boolean; margin:boolean; leverage:boolean; executionRequested:boolean; minimumRewardRisk:string }
export interface RiskValidation { allowed:boolean; reasons:RiskRejection[] }
export function validateSignalRisk(input:RiskValidationInput):RiskValidation {
  const reasons:RiskRejection[]=[]; const last=input.candidate.observations.at(-1)
  if(!last||last.capability!=='realtime'||(input.now.getTime()-Date.parse(last.sourceTimestamp))/1000>input.maxAgeSeconds)reasons.push('stale')
  if(new Decimal(input.spreadPct).gt(input.maxSpreadPct))reasons.push('spread')
  if(new Decimal(input.liquidityBRL).lt(input.minimumLiquidityBRL))reasons.push('liquidity')
  if(last){const entry=new Decimal(last.close), target=new Decimal(input.candidate.targetPrice), stop=new Decimal(input.candidate.stopPrice); if(entry.minus(stop).lte(0)||target.minus(entry).div(entry.minus(stop)).lt(input.minimumRewardRisk))reasons.push('reward_risk')}
  if(input.cooldownActive)reasons.push('cooldown'); if(input.positionLimitReached)reasons.push('position_limit'); if(input.derivatives||input.margin||input.leverage)reasons.push('derivative_or_leverage'); if(input.executionRequested)reasons.push('execution_requested')
  return {allowed:reasons.length===0,reasons}
}
