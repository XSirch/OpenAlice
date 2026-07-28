import { describe, expect, it, vi } from 'vitest'
import { SDKBaseClient } from './base-client.js'

class TestClient extends SDKBaseClient {
  quote() { return this.request('/price/quote', { symbol: 'ABEV3', provider: 'brapi' }) }
}

describe('SDKBaseClient credentials', () => {
  it('resolves a credential supplier for every request', async () => {
    let key = 'first-key'
    const execute = vi.fn(async () => [])
    const client = new TestClient({ execute } as never, 'equity', 'yfinance', () => ({ brapi_api_key: key }), new Map([['/equity/price/quote', 'EquityQuote']]))

    await client.quote()
    key = 'newly-saved-key'
    await client.quote()

    expect(execute).toHaveBeenNthCalledWith(1, 'brapi', 'EquityQuote', { symbol: 'ABEV3' }, { brapi_api_key: 'first-key' })
    expect(execute).toHaveBeenNthCalledWith(2, 'brapi', 'EquityQuote', { symbol: 'ABEV3' }, { brapi_api_key: 'newly-saved-key' })
  })
})
