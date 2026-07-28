import { describe, expect, it } from 'vitest'
import { reconcilePluggyFixedIncomeCustody } from './reconciliation.js'
import type { FixedIncomeCustodyDefinitions } from './contracts.js'

const definitions: FixedIncomeCustodyDefinitions = {
  version: 1,
  entries: [{
    source: { provider: 'pluggy', positionId: 'redacted-cdb-id' },
    product: {
      productType: 'cdb', issuer: { legalName: 'Banco Exemplo S.A.', conglomerate: 'Conglomerado Exemplo' },
      rate: { kind: 'cdi_percentage', cdiPct: '105' }, issueDate: '2025-01-02', maturityDate: '2027-01-02',
      liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'eligible', coverageLimitBRL: '250000' },
      fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [],
    },
  }],
}

describe('reconcilePluggyFixedIncomeCustody', () => {
  it('reconciles a redacted Pluggy custody snapshot without inferring unclassified products', () => {
    const result = reconcilePluggyFixedIncomeCustody({
      provider: 'pluggy', fetchedAt: '2026-07-27T20:00:00.000Z', positions: [
        { id: 'redacted-cdb-id', name: 'CDB - BANCO EXEMPLO', value: 10250.55, originalAmount: 10000.1, currency: 'BRL', asOf: '2026-07-27' },
        { id: 'unknown-fund', name: 'FUNDO SEM CLASSIFICAÇÃO', value: 1500, currency: 'BRL' },
      ],
    }, definitions)
    expect(result.positions).toMatchObject([{ investedAmountBRL: '10000.1', currentAmountBRL: '10250.55', custodyAsOf: '2026-07-27', source: { positionId: 'redacted-cdb-id' } }])
    expect(result.unclassifiedPositionIds).toEqual(['unknown-fund'])
    expect(result.unresolved).toEqual([])
  })

  it('preserves a data gap rather than treating current value as invested capital', () => {
    const result = reconcilePluggyFixedIncomeCustody({ provider: 'pluggy', fetchedAt: '2026-07-27T20:00:00.000Z', positions: [{ id: 'redacted-cdb-id', name: 'CDB', value: 10, currency: 'BRL' }] }, definitions)
    expect(result.positions).toEqual([])
    expect(result.unresolved[0]).toMatchObject({ positionId: 'redacted-cdb-id', reason: expect.stringContaining('invested amount') })
  })
})
