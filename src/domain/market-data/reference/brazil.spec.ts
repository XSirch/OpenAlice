import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBrazilMarketBoard } from './brazil.js'
import type { IndexClientLike } from '../client/types.js'

const points = (values: string[]) => values.map((valor, index) => ({
  data: `${String(index + 1).padStart(2, '0')}/01/2026`, valor,
}))

afterEach(() => vi.unstubAllGlobals())

describe('Brazil market board', () => {
  it('uses official BCB series, annualizes the daily CDI, compounds IPCA and retains index dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const id = /sgs\.(\d+)/.exec(input)?.[1]
      const rows = id === '12' ? points(['0.05', '0.06'])
        : id === '433' ? points(Array.from({ length: 12 }, () => '1.00'))
          : points(['14.25', '14.50'])
      return new Response(JSON.stringify(rows), { status: 200 })
    }))
    const indexClient = {
      getHistorical: vi.fn(async () => [
        { symbol: '^BVSP', date: '2026-01-02', close: 130000 },
        { symbol: '^BVSP', date: '2026-01-03', close: 131000 },
        { symbol: '^IFIX', date: '2026-01-03', close: 3400 },
      ]),
    } as unknown as IndexClientLike

    const board = await fetchBrazilMarketBoard(indexClient)

    expect(indexClient.getHistorical).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'br_bvsp,^IFIX', provider: 'yfinance' }))
    expect(board.cards.find((entry) => entry.id === 'SELIC')?.latest).toBe(14.5)
    expect(board.cards.find((entry) => entry.id === 'CDI')?.latest).toBeCloseTo(16.32, 1)
    expect(board.cards.find((entry) => entry.id === 'IPCA_12M')?.latest).toBeCloseTo(12.68, 2)
    expect(board.cards.find((entry) => entry.id === 'IBOV')?.latestDate).toBe('2026-01-03')
  })

  it('returns the available cards and makes a failed source explicit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.includes('.433/')) throw new Error('offline')
      return new Response(JSON.stringify(points(['1.0', '1.1'])), { status: 200 })
    }))
    const board = await fetchBrazilMarketBoard({ getHistorical: async () => [] } as unknown as IndexClientLike)
    expect(board.errors?.ipca).toMatch(/offline/)
    expect(board.cards.find((entry) => entry.id === 'SELIC')?.latest).toBe(1.1)
    expect(board.cards.find((entry) => entry.id === 'IPCA_12M')?.latest).toBeNull()
  })
})
