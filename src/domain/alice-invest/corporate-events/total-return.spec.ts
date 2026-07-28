import { describe, expect, it } from 'vitest'
import { calculateTotalReturn } from './total-return.js'
import { createCorporateEvent } from './contracts.js'
const id = (char: string) => char.repeat(64)
describe('total return breakdown', () => {
  it('separates contributions, withdrawals, price return, confirmed dividends and costs', () => {
    const operations = [{ id: id('a'), sourceHash: id('b'), sourceName: 'note.csv', sourceRow: 2, market: 'B3' as const, symbol: 'PETR4', side: 'buy' as const, tradeDate: '2026-01-01', quantity: '10', unitPriceBRL: '30', feesBRL: '1', taxesBRL: '0' }, { id: id('c'), sourceHash: id('d'), sourceName: 'note.csv', sourceRow: 3, market: 'B3' as const, symbol: 'PETR4', side: 'sell' as const, tradeDate: '2026-02-01', quantity: '4', unitPriceBRL: '35', feesBRL: '0.5', taxesBRL: '0.1' }]
    const event = createCorporateEvent({ issuer: 'CVM:1', instrument: 'PETR4', type: 'dividend', competence: '2026-01-15', revision: '1', status: 'paid', paymentDate: '2026-01-20', cashAmountPerUnitBRL: '1', title: 'Dividend', source: { id: 'cvm', url: 'https://example.test', license: 'official_public', retrievedAt: '2026-01-20T00:00:00.000Z' } })
    expect(calculateTotalReturn(operations, [event])).toEqual([expect.objectContaining({ contributionsBRL: '301.00', withdrawalsBRL: '139.40', priceReturnBRL: '19.00', dividendsBRL: '10.00', costsBRL: '1.60', quantity: '6' })])
  })
})
