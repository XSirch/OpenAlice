import { createHash, randomUUID } from 'node:crypto'
import type { SignalCandidate } from '../signals/contracts.js'
import { SignalLedger } from '../signals/ledger.js'

export interface B3ShadowInput { now:Date; enabled:boolean; marketOpen:boolean; sourceReady:boolean; candidates:SignalCandidate[]; ledger:SignalLedger }
export interface B3ShadowOutcome { signalId:string; state:'created'|'blocked'|'duplicate'; reason?:string; entry?:string; target?:string; stop?:string; trailing?:string; expiresAt?:string; mfe?:string; mae?:string; costs?:string; slippage?:string }
export interface B3ShadowResult { market:'b3'; delivery:'none'; outcomes:B3ShadowOutcome[] }

/** Records B3 candidates for measurement only. This path has no Inbox, Connector, UTA or order dependency. */
export async function runB3Shadow(input:B3ShadowInput):Promise<B3ShadowResult>{
  const blocked=!input.enabled?'market scans are disabled':!input.marketOpen?'market is closed':!input.sourceReady?'B3 realtime source evidence is unavailable':undefined
  if(blocked)return{market:'b3',delivery:'none',outcomes:[{signalId:'blocked',state:'blocked',reason:blocked}]}
  const outcomes:B3ShadowOutcome[]=[]
  for(const candidate of input.candidates){
    const signalId=stableId(candidate), latest=candidate.observations.at(-1)!
    const event={eventId:stableId({signalId,type:'created'}),signalId,type:'created' as const,at:input.now.toISOString(),candidate}
    const appended=await input.ledger.append(event)
    outcomes.push({signalId,state:appended.duplicate?'duplicate':'created',entry:latest.close,target:candidate.targetPrice,stop:candidate.stopPrice,trailing:candidate.stopPrice,expiresAt:candidate.validUntil,mfe:'0',mae:'0',costs:'0',slippage:'0'})
  }
  return{market:'b3',delivery:'none',outcomes}
}
function stableId(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-4$3-8$4-$5')}
