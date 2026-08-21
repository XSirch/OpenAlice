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
  it.each([
    'tesouro_selic', 'tesouro_prefixado', 'tesouro_prefixado_coupon',
    'tesouro_ipca', 'tesouro_ipca_coupon', 'tesouro_renda_mais',
    'tesouro_educa_mais', 'rdb', 'lc', 'debenture_incentivada',
  ] as const)('adds the PRD instrument type %s without removing legacy types', (productType) => {
    expect(fixedIncomeProductSchema.parse({ ...cdb, productType, fgc: { status: 'unknown' } }).productType).toBe(productType)
  })
  it.each([
    { kind: 'cdi_plus', spreadPct: '1.25' },
    { kind: 'selic_plus', spreadPct: '0.10' },
    { kind: 'igpm_plus', spreadPct: '6.50' },
    { kind: 'custom', label: 'Índice contratual', methodologyId: 'contract-index@1' },
  ] as const)('adds the PRD indexer $kind with explicit decimal or methodology data', (rate) => {
    expect(fixedIncomeProductSchema.parse({ ...cdb, rate }).rate).toEqual(rate)
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
