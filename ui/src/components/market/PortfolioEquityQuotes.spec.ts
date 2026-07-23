import { describe, expect, it } from 'vitest'
import type { Position } from '../../api'
import { holdingsFromPositions } from './PortfolioEquityQuotes'

function position(symbol: string, overrides: Partial<Position> = {}): Position {
  return {
    contract: { symbol, secType: 'STK', currency: 'BRL' },
    currency: 'BRL', side: 'long', quantity: '10', avgCost: '20', marketPrice: '25', marketValue: '250', unrealizedPnL: '50', realizedPnL: '0',
    ...overrides,
  }
}

describe('holdingsFromPositions', () => {
  it('keeps funded stock positions, groups duplicate symbols and ignores zero/non-stock rows', () => {
    const holdings = holdingsFromPositions([
      { position: position('PETR4'), accountLabel: 'Broker A' },
      { position: position('PETR4', { quantity: '5', marketValue: '125' }), accountLabel: 'Broker B' },
      { position: position('VALE3', { quantity: '0', marketValue: '0' }), accountLabel: 'Broker A' },
      { position: position('BTC', { contract: { symbol: 'BTC', secType: 'CRYPTO' } }), accountLabel: 'Exchange' },
    ])
    expect(holdings).toHaveLength(1)
    expect(holdings[0]).toMatchObject({ symbol: 'PETR4', quantity: 15, marketValue: 375, accountLabels: ['Broker A', 'Broker B'] })
  })
})
