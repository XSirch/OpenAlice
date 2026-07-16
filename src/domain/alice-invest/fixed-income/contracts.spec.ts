import { describe, expect, it } from 'vitest'
import { fixedIncomeProductSchema } from './contracts.js'

const cdb = {
  productType: 'cdb', issuer: { legalName: 'Banco Exemplo S.A.' }, rate: { kind: 'cdi_percentage', cdiPct: '105' },
  issueDate: '2026-01-01', maturityDate: '2027-01-01', liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1 },
  fgc: { eligible: true, coverageLimitBRL: '250000', issuerExposureBRL: '10000' },
}

describe('fixed income contracts', () => {
  it('parses a product while retaining CDI only as a rate reference', () => {
    expect(fixedIncomeProductSchema.parse(cdb)).toMatchObject({ productType: 'cdb', rate: { kind: 'cdi_percentage', cdiPct: '105' }, fees: { entryPct: '0' } })
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, productType: 'cdi' })).toThrow()
  })
  it('rejects invalid dates, floats and unsupported FGC claims', () => {
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, maturityDate: '2025-01-01' })).toThrow()
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, rate: { kind: 'fixed', annualRatePct: 12 } })).toThrow()
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, fgc: { eligible: false, coverageLimitBRL: '250000' } })).toThrow()
  })
})
