import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPluggyApiKey, fetchPluggyCustody } from './pluggy.js'

afterEach(() => vi.unstubAllGlobals())

describe('Pluggy custody client', () => {
  it('uses the short-lived server key to read and normalize investments', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiKey: 'temporary-key' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connector: { name: 'Corretora' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'petr4', code: 'PETR4', name: 'Petrobras', quantity: '12', value: '41.10', amount: '493.2', balance: '490.5', date: '2026-07-21', currencyCode: 'BRL' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, ['a1'])).resolves.toMatchObject({
      provider: 'pluggy', positions: [{ id: 'petr4', code: 'PETR4', quantity: 12, value: 490.5, grossAmount: 493.2, unitValue: 41.1, asOf: '2026-07-21', institution: 'Corretora' }],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.pluggy.ai/auth')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.pluggy.ai/items/a1')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://api.pluggy.ai/investments?itemId=a1')
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({ 'X-API-KEY': 'temporary-key' })
  })

  it('fails clearly when Pluggy accepts credentials but omits the API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    await expect(createPluggyApiKey({ clientId: 'id', clientSecret: 'secret' })).rejects.toThrow('Pluggy did not return an API key.')
  })

  it('does not make a global item-list request when no item ID is configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPluggyCustody({ clientId: 'id', clientSecret: 'secret' }, [])).rejects.toThrow('Add at least one MeuPluggy item ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
