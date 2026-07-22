import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/open-finance-config.js', () => ({
  readOpenFinanceConfig: vi.fn().mockResolvedValue({ pluggy: { enabled: true, clientId: 'id', clientSecret: 'secret', itemIds: ['item'] } }),
}))
vi.mock('@/domain/open-finance/pluggy.js', () => ({
  fetchPluggyCustody: vi.fn().mockResolvedValue({
    provider: 'pluggy', fetchedAt: '2026-07-22T00:00:00.000Z',
    positions: [{ id: 'PETR4', name: 'Petrobras', code: 'PETR4', type: 'EQUITY', quantity: 10, value: 411.5, unitValue: 41.15, currency: 'BRL' }],
  }),
}))

import { PluggyBroker } from './PluggyBroker.js'

describe('PluggyBroker', () => {
  it('normalizes custody into one funded read-only UTA account and positions', async () => {
    const broker = new PluggyBroker({ id: 'meu-pluggy', label: 'MeuPluggy' })
    await broker.init()
    await expect(broker.getAccount()).resolves.toMatchObject({ baseCurrency: 'BRL', netLiquidation: '411.5', totalCashValue: '0' })
    await expect(broker.getPositions()).resolves.toMatchObject([{
      currency: 'BRL', quantity: expect.objectContaining({}), marketValue: '411.5',
      contract: expect.objectContaining({ symbol: 'PETR4', exchange: 'PLUGGY', secType: 'STK' }),
    }])
    expect(broker.getCapabilities()).toEqual({ supportedSecTypes: [], supportedOrderTypes: [] })
  })

  it('never reports a successful order mutation', async () => {
    const broker = new PluggyBroker({ id: 'meu-pluggy' })
    await expect(broker.cancelOrder('anything')).resolves.toMatchObject({ success: false })
  })
})
