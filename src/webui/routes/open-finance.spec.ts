import { describe, expect, it, vi } from 'vitest'
import { createOpenFinanceRoutes } from './open-finance.js'
import type { FixedIncomeCustodyDefinitions } from '../../domain/alice-invest/fixed-income/contracts.js'
import { defaultFgcCoveragePolicy } from '../../domain/alice-invest/fixed-income/fgc.js'
import { defaultBrazilTaxPolicy } from '../../domain/alice-invest/tax/contracts.js'

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
    const macroExposure = await app.request('/fixed-income/macro-exposure')
    expect(macroExposure.status).toBe(200)
    expect((await macroExposure.json()).exposures.map((exposure: { dimension: string }) => exposure.dimension)).toContain('interest_rates')
  })

  it('requires explicit confirmation before a brokerage-note preview reaches the ledger', async () => {
    let persisted = { version: 1 as const, importedSourceHashes: [] as string[], entries: [] as any[] }
    const app = createOpenFinanceRoutes({
      readBrokerageLedger: vi.fn(async () => persisted),
      writeBrokerageLedger: vi.fn(async (next: unknown) => { persisted = next as typeof persisted; return persisted }),
    })
    const preview = await app.request('/tax/notes/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceName: 'nota.csv', content: 'Data Negócio;C/V;Código de Negociação;Quantidade;Preço\n02/01/2026;C;PETR4;10;30,00\n' }) })
    expect(preview.status).toBe(200)
    expect(persisted.entries).toEqual([])
    const { previewId } = await preview.json() as { previewId: string }
    const confirmed = await app.request('/tax/notes/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewId }) })
    expect(confirmed.status).toBe(200)
    expect(persisted.entries).toHaveLength(1)
    expect((await app.request('/tax/ledger')).status).toBe(200)
  })

  it('keeps tax estimation fail-closed until the policy is enabled and reviewed', async () => {
    const app = createOpenFinanceRoutes({ readBrazilTaxPolicy: vi.fn(async () => defaultBrazilTaxPolicy) })
    const response = await app.request('/tax/estimate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetClass: 'b3_equity_common', grossSalesBRL: '30000', netGainBRL: '1000', sources: ['brokerage_note', 'transaction_history'] }) })
    expect(response.status).toBe(409)
    expect((await response.json()).readiness.reasons[0]).toMatch(/not enabled/)
  })

  it('exports an authenticated-route tax report with redacted sources by default', async () => {
    const entry = { id: 'a'.repeat(64), sourceHash: 'b'.repeat(64), sourceName: 'nota-pessoal.csv', sourceRow: 2, market: 'B3' as const, symbol: 'PETR4', side: 'buy' as const, tradeDate: '2026-01-02', quantity: '10', unitPriceBRL: '30', feesBRL: '0', taxesBRL: '0' }
    const app = createOpenFinanceRoutes({ readBrokerageLedger: vi.fn(async () => ({ version: 1 as const, importedSourceHashes: [entry.sourceHash], entries: [entry] })) })
    const response = await app.request('/tax/report?format=csv&from=2026-01-01&to=2026-01-31')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(await response.text()).not.toContain('nota-pessoal.csv')
  })
  it('associates only confirmed cached events to ledger positions without changing the ledger', async () => {
    const entry = { id: 'a'.repeat(64), sourceHash: 'b'.repeat(64), sourceName: 'nota.csv', sourceRow: 2, market: 'B3' as const, symbol: 'PETR4', side: 'buy' as const, tradeDate: '2026-01-02', quantity: '10', unitPriceBRL: '30', feesBRL: '0', taxesBRL: '0' }
    const event = { id: 'c'.repeat(64), issuer: 'CVM:9512', instrument: 'PETR4', type: 'dividend' as const, competence: '2026-01-03', revision: '1', status: 'confirmed' as const, cashAmountPerUnitBRL: '1', title: 'Dividend', source: { id: 'cvm' as const, url: 'https://example.test/cvm', license: 'official_public' as const, retrievedAt: '2026-01-03T00:00:00.000Z' } }
    const app = createOpenFinanceRoutes({ readBrokerageLedger: vi.fn(async () => ({ version: 1 as const, importedSourceHashes: [entry.sourceHash], entries: [entry] })), readCorporateEvents: vi.fn(async () => [event]) })
    const response = await app.request('/tax/corporate-event-associations')
    expect(await response.json()).toMatchObject({ associations: [{ association: { positionSymbol: 'PETR4', confidence: 'exact' } }] })
  })
})
