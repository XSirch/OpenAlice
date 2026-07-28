import { describe, expect, it } from 'vitest'
import { fixedIncomePositionSchema, fixedIncomeProductSchema, normalizeFixedIncomePosition } from './contracts.js'

const cdb = {
  productType: 'cdb', issuer: { legalName: 'Banco Exemplo S.A.' }, rate: { kind: 'cdi_percentage', cdiPct: '105' },
  issueDate: '2026-01-01', maturityDate: '2027-01-01', liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1 },
  fgc: { status: 'eligible', coverageLimitBRL: '250000', issuerExposureBRL: '10000' },
}

describe('fixed income contracts', () => {
  it('parses a product while retaining CDI only as a rate reference', () => {
    expect(fixedIncomeProductSchema.parse(cdb)).toMatchObject({ productType: 'cdb', rate: { kind: 'cdi_percentage', cdiPct: '105' }, fees: { entryPct: '0' } })
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, productType: 'cdi' })).toThrow()
  })
  it('rejects invalid dates, floats and unsupported FGC claims', () => {
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, maturityDate: '2025-01-01' })).toThrow()
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, rate: { kind: 'fixed', annualRatePct: 12 } })).toThrow()
    expect(() => fixedIncomeProductSchema.parse({ ...cdb, fgc: { status: 'unknown', coverageLimitBRL: '250000' } })).toThrow()
  })
  it.each(['cdb', 'lci', 'lca', 'tesouro_direto', 'fixed_income_fund', 'debenture', 'cri', 'cra'] as const)('represents %s without guessing FGC', (productType) => {
    const status = productType === 'cdb' ? 'eligible' : 'unknown'
    expect(fixedIncomeProductSchema.parse({ ...cdb, productType, fgc: { status } }).fgc.status).toBe(status)
  })
  it('normalizes decimal custody values, source identity and data-base', () => {
    const position = normalizeFixedIncomePosition({
      id: 'pluggy-cdb-1', product: cdb, investedAmountBRL: '10000.10', currentAmountBRL: '10250.55', custodyAsOf: '2026-07-27',
      source: { provider: 'pluggy', positionId: 'investment-1' },
    })
    expect(position.currentAmountBRL).toBe('10250.55')
    expect(() => fixedIncomePositionSchema.parse({ ...position, currentAmountBRL: 10250.55 })).toThrow()
  })
})
