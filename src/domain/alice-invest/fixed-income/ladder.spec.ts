import { describe, expect, it } from 'vitest'
import { buildFixedIncomeLadder } from './ladder.js'
import type { FixedIncomePosition } from './contracts.js'

const cdb: FixedIncomePosition = {
  id: 'cdb', investedAmountBRL: '1000', currentAmountBRL: '1050', marketValueBRL: '1040', redemptionAmountBRL: '1050', acquiredDate: '2026-01-01', custodyAsOf: '2026-07-27', source: { provider: 'pluggy', positionId: 'cdb' },
  product: { productType: 'cdb', issuer: { legalName: 'Banco A' }, rate: { kind: 'cdi_percentage', cdiPct: '105' }, issueDate: '2025-01-01', maturityDate: '2026-10-01', liquidity: { redemption: 'scheduled', settlementBusinessDays: 1, noticeBusinessDays: 2 }, fgc: { status: 'eligible' }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] },
}

describe('buildFixedIncomeLadder', () => {
  it('groups maturity, preserves market/redemption values, liquidity and CDI-based net estimate', () => {
    const ladder = buildFixedIncomeLadder({ positions: [cdb], asOf: '2026-07-27', annualCdiPct: '14' })
    const entry = ladder.buckets['31_to_90_days'].entries[0]
    expect(entry).toMatchObject({ liquidityDays: 3, marketValueBRL: '1040', redemptionAmountBRL: '1050', benchmark: 'CDI', annualGrossRatePct: '14.7000' })
    expect(entry.annualNetRatePct).not.toBeNull()
  })
  it('leaves index and acquisition gaps visible instead of silently estimating', () => {
    const ladder = buildFixedIncomeLadder({ positions: [{ ...cdb, acquiredDate: undefined }], asOf: '2026-07-27' })
    const entry = ladder.buckets['31_to_90_days'].entries[0]
    expect(entry.annualNetRatePct).toBeNull()
    expect(entry.gaps.join(' ')).toMatch(/CDI|acquisition date/)
  })
})
