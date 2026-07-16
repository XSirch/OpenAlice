import Decimal from 'decimal.js'
import { evaluateB3TrendStrategy } from './b3-strategy.js'
import type { SignalObservation } from './contracts.js'

export const B3_BACKTEST_TIME_ZONE = 'America/Sao_Paulo'

export interface B3BacktestBar {
  timestamp: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export interface B3BacktestFixture {
  version: 1
  source: string
  symbol: string
  bars: B3BacktestBar[]
}

export interface B3BacktestConfig {
  feeBps: string
  slippageBps: string
}

export interface B3BacktestTrade {
  signalAt: string
  entryAt: string
  exitAt: string
  entryPrice: string
  exitPrice: string
  grossReturnPct: string
  netReturnPct: string
  costs: string
  exitReason: 'target' | 'stop' | 'end_of_fixture'
}

/**
 * Backtests the transparent B3 strategy against a versioned fixture.
 * A signal is calculated from trailing bars only and is filled at the next
 * session's open. Thus a future bar can affect an exit, never a decision.
 */
export function runB3Backtest(fixture: B3BacktestFixture, config: B3BacktestConfig): B3BacktestTrade[] {
  if (fixture.version !== 1 || fixture.bars.length < 6 || !fixture.bars.every(bar => isB3SessionTimestamp(bar.timestamp))) return []
  const fee = new Decimal(config.feeBps).div(10_000)
  const slippage = new Decimal(config.slippageBps).div(10_000)
  const trades: B3BacktestTrade[] = []
  let nextEligibleIndex = 4
  for (let signalIndex = 4; signalIndex < fixture.bars.length - 1; signalIndex++) {
    if (signalIndex < nextEligibleIndex) continue
    const candidate = evaluateB3TrendStrategy({
      symbol: fixture.symbol,
      shortTerm: observations(fixture, fixture.bars.slice(signalIndex - 2, signalIndex + 1)),
      longTerm: observations(fixture, fixture.bars.slice(signalIndex - 4, signalIndex + 1)),
      now: new Date(fixture.bars[signalIndex].timestamp),
      // The fixture timestamp is the point-in-time clock; one second permits
      // that exact observation through the production freshness predicate.
      maxAgeSeconds: 1,
    })
    if (!candidate) continue
    const entryIndex = signalIndex + 1
    const entry = new Decimal(fixture.bars[entryIndex].open).mul(new Decimal(1).plus(slippage))
    const target = new Decimal(candidate.targetPrice)
    const stop = new Decimal(candidate.stopPrice)
    let exitIndex = fixture.bars.length - 1
    let exit = new Decimal(fixture.bars[exitIndex].close).mul(new Decimal(1).minus(slippage))
    let exitReason: B3BacktestTrade['exitReason'] = 'end_of_fixture'
    for (let i = entryIndex; i < fixture.bars.length; i++) {
      const bar = fixture.bars[i]
      // A stop wins a same-bar target/stop conflict: conservative and reproducible.
      if (new Decimal(bar.low).lte(stop)) { exitIndex = i; exit = stop.mul(new Decimal(1).minus(slippage)); exitReason = 'stop'; break }
      if (new Decimal(bar.high).gte(target)) { exitIndex = i; exit = target.mul(new Decimal(1).minus(slippage)); exitReason = 'target'; break }
    }
    const gross = exit.div(entry).minus(1)
    const net = gross.minus(fee.mul(2))
    const costs = entry.mul(fee).plus(exit.mul(fee)).plus(entry.mul(slippage)).plus(exit.mul(slippage))
    trades.push({ signalAt: fixture.bars[signalIndex].timestamp, entryAt: fixture.bars[entryIndex].timestamp, exitAt: fixture.bars[exitIndex].timestamp, entryPrice: entry.toFixed(6), exitPrice: exit.toFixed(6), grossReturnPct: gross.mul(100).toFixed(6), netReturnPct: net.mul(100).toFixed(6), costs: costs.toFixed(6), exitReason })
    nextEligibleIndex = exitIndex + 1
  }
  return trades
}

function observations(fixture: B3BacktestFixture, bars: B3BacktestBar[]): SignalObservation[] {
  return bars.map(bar => ({ symbol: fixture.symbol, source: fixture.source, sourceTimestamp: bar.timestamp, receivedAt: bar.timestamp, capability: 'realtime', close: bar.close, volume: bar.volume }))
}

function isB3SessionTimestamp(timestamp: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: B3_BACKTEST_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date(timestamp)) >= '10'
  } catch { return false }
}
