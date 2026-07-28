import { describe, expect, it, vi } from 'vitest'
import { resolvePersistentBrazilBoard, type BrazilMarketBoardCache } from './brazil-market-board-cache.js'
import type { BrazilMarketBoard } from '../domain/market-data/reference/types.js'

const board: BrazilMarketBoard = { cards: [{ id: 'SELIC', label: 'Selic', unit: 'percent', points: [], latest: 14.25, latestDate: '2026-07-27', change: null }], meta: { provider: 'BCB', asOf: '2026-07-27T12:00:00.000Z' } }
const cached: BrazilMarketBoardCache = { version: 1, refreshedAt: '2026-07-27T12:00:00.000Z', board }

describe('persistent Brazil market board cache', () => {
  it('uses a fresh durable cache without calling the upstream', async () => {
    const refresh = vi.fn(async () => board)
    const result = await resolvePersistentBrazilBoard({ read: async () => cached, write: async () => undefined, refresh, ttlMs: 300_000, now: () => new Date('2026-07-27T12:01:00.000Z') })
    expect(refresh).not.toHaveBeenCalled()
    expect(result).toMatchObject({ source: 'persistent-cache', board: { meta: { cachedAt: cached.refreshedAt } } })
  })
  it('refreshes an expired cache and marks it stale only when refresh fails', async () => {
    const refresh = vi.fn(async () => { throw new Error('offline') })
    const result = await resolvePersistentBrazilBoard({ read: async () => cached, write: async () => undefined, refresh, ttlMs: 1, now: () => new Date('2026-07-27T12:10:00.000Z') })
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.board.meta.stale).toBe(true)
    expect(result.board.meta.cachedAt).toBe(cached.refreshedAt)
  })
  it('writes a successful refresh after cache expiry', async () => {
    const write = vi.fn(async () => undefined)
    const result = await resolvePersistentBrazilBoard({ read: async () => cached, write, refresh: async () => board, ttlMs: 1, now: () => new Date('2026-07-27T12:10:00.000Z') })
    expect(result.source).toBe('refresh')
    expect(write).toHaveBeenCalledWith(board, '2026-07-27T12:10:00.000Z')
  })
})
