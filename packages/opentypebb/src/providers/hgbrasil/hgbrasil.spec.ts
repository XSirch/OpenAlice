import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExecutor } from '../../core/api/app-loader.js'

afterEach(() => vi.unstubAllGlobals())

describe('HG Brasil provider', () => {
  it('maps a delayed B3 quote without exposing its key in the client surface', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{
      ticker: 'B3:PETR4', symbol: 'PETR4', name: 'Petrobras', full_name: 'Petróleo Brasileiro S.A.', kind: 'stock', currency: 'BRL',
      quote: { value: 41.15, change_value: 0.25, change_percent: 0.61, updated_at: '2026-07-22T11:15:00-03:00' },
      market: { open: 41.2, close: 41.15, high: 41.44, low: 40.47, volume: 26965000, previous_value: 40.9 },
    }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createExecutor().execute('hgbrasil', 'EquityQuote', { symbol: 'PETR4' }, { hgbrasil_api_key: 'test-key' }) as Array<Record<string, unknown>>

    expect(result[0]).toMatchObject({ symbol: 'PETR4', exchange: 'B3', close: 41.15 })
    expect(result[0]?.change_percent).toBeCloseTo(0.0061)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('tickers=B3%3APETR4')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('key=test-key')
  })

  it('reports HG key and plan diagnostics without including the secret', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { key_status: 'invalid' }, message: 'Chave inválida',
    }), { status: 200 })))

    await expect(createExecutor().execute('hgbrasil', 'EquityQuote', { symbol: 'PETR4' }, { hgbrasil_api_key: 'secret-value' }))
      .rejects.toThrow('HG Brasil returned no results (key status: invalid): Chave inválida')
  })

  it('reports a successful-but-empty HG response as an authorization error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { key_status: 'invalid' }, results: [], errors: [{ code: 'UNAUTHORIZED_KEY', message: 'Chave não possui acesso para este recurso.' }],
    }), { status: 200 })))

    await expect(createExecutor().execute('hgbrasil', 'EquityQuote', { symbol: 'PETR4' }, { hgbrasil_api_key: 'secret-value' }))
      .rejects.toThrow('HG Brasil returned no results (key status: invalid): UNAUTHORIZED_KEY: Chave não possui acesso para este recurso.')
  })
})
