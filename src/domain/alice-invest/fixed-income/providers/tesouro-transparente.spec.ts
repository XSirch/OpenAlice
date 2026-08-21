import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import { TesouroTransparenteProvider, type FixedIncomeHttpClient } from './tesouro-transparente.js'

const csvUrl = 'https://www.tesourotransparente.gov.br/ckan/dataset/resource/download/precotaxatesourodireto.csv'
const metadata = {
  success: true,
  result: {
    license_id: 'odc-odbl',
    metadata_modified: '2026-08-20T10:21:10.510683',
    resources: [{
      id: '796d2059-14e9-44e3-80c9-2d9e30b405c1',
      state: 'active',
      format: 'CSV',
      url: csvUrl,
      last_modified: '2026-08-20T10:21:10.469524',
      revision_id: 'dc2f932d-03eb-4926-b103-e8e968d1a89c',
    }],
  },
}

describe('Tesouro Transparente provider', () => {
  it('discovers the active official CSV and normalizes its latest rows', async () => {
    const csv = await readFile(new URL('../fixtures/tesouro-transparente-2026-08-19.csv', import.meta.url))
    const http: FixedIncomeHttpClient = {
      get: vi.fn(async (url) => url === csvUrl
        ? { status: 200, contentType: 'text/csv', body: csv }
        : { status: 200, contentType: 'application/json', body: Buffer.from(JSON.stringify(metadata)) }),
    }
    const provider = new TesouroTransparenteProvider({
      http,
      now: () => new Date('2026-08-20T12:00:00.000Z'),
      validUntil: () => '2026-08-21T23:59:59.000Z',
    })

    const snapshot = await provider.fetch({
      dataset: 'treasury_prices', asOf: '2026-08-20T12:00:00.000Z', identifiers: {},
    })

    expect(snapshot.payload).toMatchObject({
      resourceId: '796d2059-14e9-44e3-80c9-2d9e30b405c1',
      referenceDate: '2026-08-19',
      rows: expect.arrayContaining([
        expect.objectContaining({ productType: 'tesouro_selic', maturityDate: '2029-03-01', buyRatePct: '0.03', sellUnitPriceBRL: '19672.33' }),
        expect.objectContaining({ productType: 'tesouro_ipca_coupon', maturityDate: '2037-05-15', sellRatePct: '7.87' }),
        expect.objectContaining({ productType: 'tesouro_renda_mais', maturityDate: '2049-12-15' }),
      ]),
    })
    expect(snapshot.provenance[0]).toMatchObject({
      sourceId: 'tesouro_transparente.td_price_rate.v1', decision: 'automate', license: 'open_data',
      dataAsOf: '2026-08-19', originalIdentifiers: { resourceId: '796d2059-14e9-44e3-80c9-2d9e30b405c1' },
    })
    expect(snapshot.provenance[0]!.rawPayloadChecksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects unexpected content types and unsupported datasets', async () => {
    const http: FixedIncomeHttpClient = { get: async (url) => url === csvUrl
      ? { status: 200, contentType: 'text/html', body: Buffer.from('<html>blocked</html>') }
      : { status: 200, contentType: 'application/json', body: Buffer.from(JSON.stringify(metadata)) } }
    const provider = new TesouroTransparenteProvider({ http, now: () => new Date('2026-08-20T12:00:00.000Z') })
    await expect(provider.fetch({ dataset: 'treasury_prices', asOf: '2026-08-20T12:00:00.000Z', identifiers: {} })).rejects.toThrow(/content type/)
    await expect(provider.fetch({ dataset: 'macro_series', asOf: '2026-08-20T12:00:00.000Z', identifiers: {} })).rejects.toThrow(/dataset/)
  })
})
