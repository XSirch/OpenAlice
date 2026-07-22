import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/open-finance-config.js', () => ({
  readOpenFinanceConfig: vi.fn().mockResolvedValue({ pluggy: { enabled: true, clientId: 'id', clientSecret: 'secret', itemIds: ['item'] } }),
}))
vi.mock('@/domain/open-finance/pluggy.js', () => ({
  fetchPluggyCustody: vi.fn().mockResolvedValue({
    provider: 'pluggy', fetchedAt: '2026-07-22T00:00:00.000Z',
    positions: [{ id: 'PETR4', name: 'Petrobras', code: 'PETR4', type: 'EQUITY', quantity: 10, value: 411.5, originalAmount: 400, profit: 11.5, unitValue: 41.15, currency: 'BRL' }],
  }),
}))

import { PluggyBroker } from './PluggyBroker.js'
import { fetchPluggyCustody } from '@/domain/open-finance/pluggy.js'

describe('PluggyBroker', () => {
  it('normalizes custody into one funded read-only UTA account and positions', async () => {
    const broker = new PluggyBroker({ id: 'meu-pluggy', label: 'MeuPluggy' })
    await broker.init()
    await expect(broker.getAccount()).resolves.toMatchObject({ baseCurrency: 'BRL', netLiquidation: '411.5', totalCashValue: '0', unrealizedPnL: '11.5' })
    await expect(broker.getPositions()).resolves.toMatchObject([{
      currency: 'BRL', quantity: expect.objectContaining({}), avgCost: '40', marketValue: '411.5', unrealizedPnL: '11.5',
      contract: expect.objectContaining({ symbol: 'PETR4', exchange: 'PLUGGY', secType: 'STK' }),
    }])
    expect(broker.getCapabilities()).toEqual({ supportedSecTypes: [], supportedOrderTypes: [] })
  })

  it('never reports a successful order mutation', async () => {
    const broker = new PluggyBroker({ id: 'meu-pluggy' })
    await expect(broker.cancelOrder('anything')).resolves.toMatchObject({ success: false })
  })

  it('coalesces concurrent account and position reads into one Pluggy refresh', async () => {
    const deferred = Promise.withResolvers<Awaited<ReturnType<typeof fetchPluggyCustody>>>()
    vi.mocked(fetchPluggyCustody).mockClear()
    vi.mocked(fetchPluggyCustody).mockReturnValueOnce(deferred.promise)
    const broker = new PluggyBroker({ id: 'meu-pluggy' })

    const account = broker.getAccount()
    const positions = broker.getPositions()
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchPluggyCustody).toHaveBeenCalledTimes(1)

    deferred.resolve({
      provider: 'pluggy', fetchedAt: '2026-07-22T00:00:00.000Z',
      positions: [{ id: 'PETR4', name: 'Petrobras', quantity: 10, value: 411.5, unitValue: 41.15, currency: 'BRL' }],
    })
    await expect(Promise.all([account, positions])).resolves.toHaveLength(2)
  })
})
