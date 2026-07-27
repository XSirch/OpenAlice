import { describe, expect, it, vi } from 'vitest'
import { createPortfolioCacheRoutes } from './portfolio-cache.js'

const cache = {
  version: 1 as const,
  refreshedAt: '2026-07-27T15:00:00.000Z',
  data: { accounts: [], fxRates: [] },
  aggregateCurve: null,
  curvePoints: [],
  curveAccountId: 'all',
}

describe('portfolio cache routes', () => {
  it('reads, writes, and clears the durable presentation without exposing any credential fields', async () => {
    const read = vi.fn(async () => cache)
    const write = vi.fn(async (value: unknown) => value as typeof cache)
    const clear = vi.fn(async () => undefined)
    const app = createPortfolioCacheRoutes({ read, write, clear })

    const get = await app.request('/')
    expect(await get.json()).toEqual({ cache })

    const put = await app.request('/', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cache) })
    expect(put.status).toBe(200)
    expect(write).toHaveBeenCalledWith(cache)

    const remove = await app.request('/', { method: 'DELETE' })
    expect(remove.status).toBe(204)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('returns a validation error from the storage boundary', async () => {
    const app = createPortfolioCacheRoutes({
      read: vi.fn(),
      write: vi.fn(async () => { throw new Error('Portfolio cache is too large.') }),
      clear: vi.fn(),
    })
    const response = await app.request('/', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Portfolio cache is too large.' })
  })
})
