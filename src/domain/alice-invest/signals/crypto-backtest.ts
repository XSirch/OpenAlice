import Decimal from 'decimal.js'
import { evaluateCryptoSpotStrategy } from './crypto-strategy.js'
import type { SignalObservation } from './contracts.js'

export interface CryptoBacktestBar { timestamp:string; open:string; high:string; low:string; close:string; volume:string }
export interface CryptoBacktestFixture { version:1; source:string; symbol:string; bars:CryptoBacktestBar[] }
export interface CryptoBacktestConfig { feeBps:string; slippageBps:string }
export interface CryptoBacktestTrade { signalAt:string; entryAt:string; exitAt:string; entryPrice:string; exitPrice:string; netReturnPct:string; costs:string; exitReason:'target'|'stop'|'end_of_fixture' }

/** Spot-only, 24/7 fixture backtest. Each decision sees trailing candles only. */
export function runCryptoSpotBacktest(fixture:CryptoBacktestFixture, config:CryptoBacktestConfig):CryptoBacktestTrade[] {
  if(fixture.version!==1||fixture.bars.length<6||!fixture.bars.every(bar=>Number.isFinite(Date.parse(bar.timestamp))))return []
  const fee=new Decimal(config.feeBps).div(10_000), slip=new Decimal(config.slippageBps).div(10_000), out:CryptoBacktestTrade[]=[]
  let next=4
  for(let signalIndex=4;signalIndex<fixture.bars.length-1;signalIndex++) {
    if(signalIndex<next)continue
    const candidate=evaluateCryptoSpotStrategy({symbol:fixture.symbol,fast:observations(fixture,fixture.bars.slice(signalIndex-2,signalIndex+1)),slow:observations(fixture,fixture.bars.slice(signalIndex-4,signalIndex+1)),now:new Date(fixture.bars[signalIndex].timestamp),maxAgeSeconds:1,spotReadOnly:true})
    if(!candidate)continue
    const entryIndex=signalIndex+1, entry=new Decimal(fixture.bars[entryIndex].open).mul(new Decimal(1).plus(slip)), target=new Decimal(candidate.targetPrice), stop=new Decimal(candidate.stopPrice)
    let exitIndex=fixture.bars.length-1, exit=new Decimal(fixture.bars[exitIndex].close).mul(new Decimal(1).minus(slip)), exitReason:CryptoBacktestTrade['exitReason']='end_of_fixture'
    for(let i=entryIndex;i<fixture.bars.length;i++){const bar=fixture.bars[i];if(new Decimal(bar.low).lte(stop)){exitIndex=i;exit=stop.mul(new Decimal(1).minus(slip));exitReason='stop';break}if(new Decimal(bar.high).gte(target)){exitIndex=i;exit=target.mul(new Decimal(1).minus(slip));exitReason='target';break}}
    const net=exit.div(entry).minus(1).minus(fee.mul(2)), costs=entry.plus(exit).mul(fee.plus(slip))
    out.push({signalAt:fixture.bars[signalIndex].timestamp,entryAt:fixture.bars[entryIndex].timestamp,exitAt:fixture.bars[exitIndex].timestamp,entryPrice:entry.toFixed(6),exitPrice:exit.toFixed(6),netReturnPct:net.mul(100).toFixed(6),costs:costs.toFixed(6),exitReason});next=exitIndex+1
  } return out
}
function observations(fixture:CryptoBacktestFixture,bars:CryptoBacktestBar[]):SignalObservation[]{return bars.map(bar=>({symbol:fixture.symbol,source:fixture.source,sourceTimestamp:bar.timestamp,receivedAt:bar.timestamp,capability:'realtime',close:bar.close,volume:bar.volume}))}
