import { describe, expect, it } from 'vitest'
import { B3_BACKTEST_TIME_ZONE, runB3Backtest, type B3BacktestFixture } from './b3-backtest.js'

const fixture: B3BacktestFixture = { version: 1, source: 'b3-versioned-fixture-2026-07', symbol: 'PETR4', bars: [
  ['2026-07-13T13:00:00.000Z', '10.00', '10.10', '9.90', '10.00'],
  ['2026-07-14T13:00:00.000Z', '10.20', '10.30', '10.10', '10.20'],
  ['2026-07-15T13:00:00.000Z', '10.40', '10.50', '10.30', '10.40'],
  ['2026-07-16T13:00:00.000Z', '10.60', '10.70', '10.50', '10.60'],
  ['2026-07-17T13:00:00.000Z', '10.80', '10.90', '10.70', '10.80'],
  ['2026-07-20T13:00:00.000Z', '10.90', '11.10', '10.80', '11.00'],
].map(([timestamp, open, high, low, close]) => ({ timestamp, open, high, low, close, volume: '1000000' })) }
const config = { feeBps: '10', slippageBps: '5' }

describe('B3 backtest', () => {
  it('uses versioned B3 fixture data, next-session entry, costs and slippage', () => {
    expect(B3_BACKTEST_TIME_ZONE).toBe('America/Sao_Paulo')
    expect(runB3Backtest(fixture, config)).toMatchInlineSnapshot(`
      [
        {
          "costs": "0.032880",
          "entryAt": "2026-07-20T13:00:00.000Z",
          "entryPrice": "10.905450",
          "exitAt": "2026-07-20T13:00:00.000Z",
          "exitPrice": "11.014490",
          "exitReason": "target",
          "grossReturnPct": "0.999867",
          "netReturnPct": "0.799867",
          "signalAt": "2026-07-17T13:00:00.000Z",
        },
      ]
    `)
  })

  it('does not use a future bar to decide a signal', () => {
    const futureChanged: B3BacktestFixture = { ...fixture, bars: fixture.bars.map((bar, index) => index === 5 ? { ...bar, high: '999.00', close: '999.00' } : bar) }
    expect(runB3Backtest(fixture, config)[0].signalAt).toBe(runB3Backtest(futureChanged, config)[0].signalAt)
    expect(runB3Backtest(fixture, config)[0].entryAt).toBe('2026-07-20T13:00:00.000Z')
  })

  it('rejects fixtures outside a B3 local trading session', () => {
    const invalid = { ...fixture, bars: [{ ...fixture.bars[0], timestamp: '2026-07-13T11:00:00.000Z' }, ...fixture.bars.slice(1)] }
    expect(runB3Backtest(invalid, config)).toEqual([])
  })
})
