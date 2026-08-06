import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPluggyApiKey, fetchPluggyCustody, fetchPluggyOverview } from './pluggy.js'

afterEach(() => vi.unstubAllGlobals())

describe('Pluggy custody client', () => {
  it('uses the short-lived server key to read and normalize investments', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { name: 'Corretora' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'petr4', code: 'PETR4', name: 'Petrobras', quantity: '12', value: '41.10', amount: '493.2', balance: '490.5', amountOriginal: '450', amountProfit: '40.5', date: '2026-07-21', currencyCode: 'BRL' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ type: 'BUY', amount: 450, tradeDate: '2024-01-15T00:00:00.000Z' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'])).resolves.toMatchObject({
      provider: 'pluggy', positions: [{ id: 'petr4', code: 'PETR4', quantity: 12, value: 490.5, originalAmount: 450, profit: 40.5, acquiredAt: '2024-01-15T00:00:00.000Z', costBasisSource: 'reported', grossAmount: 493.2, unitValue: 41.1, asOf: '2026-07-21', institution: 'Corretora' }],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.pluggy.ai/auth')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.pluggy.ai/items/a1')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://api.pluggy.ai/investments?itemId=a1')
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://api.pluggy.ai/investments/petr4/transactions?pageSize=500')
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({ 'X-API-KEY': 'temporary-key' })
  })

  it('fails clearly when Pluggy accepts credentials but omits the API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    await expect(createPluggyApiKey({ clientId: 'id', clientSecret: 'secret' })).rejects.toThrow('Pluggy did not return an API key.')
  })

  it('resolves the institution from the Item connector id and builds the dashboard overview', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { id: 201 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [
        { id: 'bank', type: 'BANK', name: 'Conta Corrente', number: '12345-6', balance: 718.59, currencyCode: 'BRL' },
        { id: 'card', type: 'CREDIT', marketingName: 'Black', number: '5528', balance: 161.45, currencyCode: 'BRL' },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [
        { id: 'investment', name: 'CDB', balance: 1000, currencyCode: 'BRL' },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 201, name: 'Itaú' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const overview = await fetchPluggyOverview({ clientId: 'id', clientSecret: 'secret' }, ['a1'])
    expect(overview.institutions).toEqual([expect.objectContaining({
      itemId: 'a1',
      name: 'Itaú',
      bankAccounts: [expect.objectContaining({ id: 'bank', numberLast4: '3456', balance: 718.59 })],
      creditCards: [expect.objectContaining({ id: 'card', numberLast4: '5528', balance: 161.45 })],
      investments: { count: 1, total: 1000, currency: 'BRL' },
    })])
    expect(fetchMock.mock.calls.map((call) => call[0])).toContain('https://api.pluggy.ai/connectors/201')
  })

  it('uses the connector endpoint for custody when the Item only carries a connector id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { id: 201 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'cdb', name: 'CDB', balance: 1000, currencyCode: 'BRL' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 201, name: 'Nubank' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'])
    expect(snapshot.positions[0]?.institution).toBe('Nubank')
  })

  it('uses the confirmed Item institution for MeuPluggy proxy connections', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { id: 999, name: 'MeuPluggy' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'cdb', name: 'CDB', balance: 1000, currencyCode: 'BRL' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'], { a1: 'Nubank' })
    expect(snapshot.positions[0]?.institution).toBe('Nubank')
  })

  it('does not report MeuPluggy itself as the custodian when an Item has no confirmed institution', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { name: 'MeuPluggy' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'cdb', name: 'CDB', balance: 1000, currencyCode: 'BRL' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'])
    expect(snapshot.positions[0]?.institution).toBeUndefined()
  })

  it('omits closed Pluggy records with no material balance or quantity', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { name: 'Corretora' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [
        { id: 'closed', name: 'CDB closed', quantity: 0, balance: 0, value: 0.01, currencyCode: 'BRL' },
        { id: 'residual', name: 'CDB residual', quantity: 0, balance: 0.004, value: 0.01, currencyCode: 'BRL' },
        { id: 'open', name: 'CDB open', quantity: 10, balance: 1000, value: 100, currencyCode: 'BRL' },
      ] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'])
    expect(snapshot.positions.map((position) => position.id)).toEqual(['open'])
  })

  it('derives invested capital and acquisition date from transactions when the investment omits its cost basis', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { name: 'Corretora' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'transaction-basis', name: 'CDB', quantity: 100, balance: 1100, value: 11, amountOriginal: 0, currencyCode: 'BRL' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [
        { type: 'BUY', amount: 800, tradeDate: '2024-03-10T00:00:00.000Z' },
        { type: 'BUY', amount: 200, tradeDate: '2024-01-10T00:00:00.000Z' },
        { type: 'SELL', amount: 100, tradeDate: '2025-01-10T00:00:00.000Z' },
      ] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'])
    expect(snapshot.positions).toMatchObject([{
      id: 'transaction-basis', originalAmount: 900, acquiredAt: '2024-01-10T00:00:00.000Z', costBasisSource: 'transactions',
    }])
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://api.pluggy.ai/investments/transaction-basis/transactions?pageSize=500')
  })

  it('does not make a global item-list request when no item ID is configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, [])).rejects.toThrow('Add at least one MeuPluggy item ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
