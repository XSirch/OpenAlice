import { describe, expect, it, vi } from 'vitest'
import { createOpenFinanceRoutes } from './open-finance.js'
import type { FixedIncomeCustodyDefinitions } from '../../domain/alice-invest/fixed-income/contracts.js'
import { defaultFgcCoveragePolicy } from '../../domain/alice-invest/fixed-income/fgc.js'

const definitions: FixedIncomeCustodyDefinitions = { version: 1, entries: [] }
const config = { version: 1 as const, pluggy: { enabled: true, clientId: 'client', clientSecret: 'secret', itemIds: ['00000000-0000-4000-8000-000000000001'] } }

describe('open finance fixed-income routes', () => {
  it('stores explicit classifications and reconciles them through a read-only snapshot', async () => {
    const readDefinitions = vi.fn(async () => definitions)
    const writeDefinitions = vi.fn(async (value: unknown) => value as FixedIncomeCustodyDefinitions)
    const fetchCustody = vi.fn(async () => ({ provider: 'pluggy' as const, fetchedAt: '2026-07-27T20:00:00.000Z', positions: [] }))
    const app = createOpenFinanceRoutes({ readDefinitions, writeDefinitions, readFgcPolicy: vi.fn(async () => defaultFgcCoveragePolicy), writeFgcPolicy: vi.fn(async (value: unknown) => value as typeof defaultFgcCoveragePolicy), readConfig: vi.fn(async () => config), fetchCustody })
    expect((await app.request('/fixed-income/definitions')).status).toBe(200)
    const put = await app.request('/fixed-income/definitions', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(definitions) })
    expect(put.status).toBe(200)
    const reconciliation = await app.request('/fixed-income/reconcile')
    expect(reconciliation.status).toBe(200)
    expect(await reconciliation.json()).toEqual({ positions: [], unresolved: [], unclassifiedPositionIds: [] })
    expect(fetchCustody).toHaveBeenCalledWith({ clientId: 'client', clientSecret: 'secret' }, config.pluggy.itemIds)
    const fgc = await app.request('/fixed-income/fgc')
    expect(fgc.status).toBe(200)
    expect(await fgc.json()).toMatchObject({ eligibleAmountBRL: '0.00', reconciliation: { positions: [] } })
    const ladder = await app.request('/fixed-income/ladder?annualCdiPct=14')
    expect(ladder.status).toBe(200)
    expect(await ladder.json()).toMatchObject({ buckets: { up_to_30_days: { entries: [] } }, reconciliation: { positions: [] } })
    const summary = await app.request('/fixed-income/summary')
    expect(summary.status).toBe(200)
    expect(await summary.json()).toMatchObject({ snapshot: { positions: [] }, fgc: { eligibleAmountBRL: '0.00' }, ladder: { buckets: { up_to_30_days: { entries: [] } } } })
  })
})
