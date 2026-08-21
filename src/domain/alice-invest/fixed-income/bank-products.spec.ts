import { describe, expect, it } from 'vitest'

import { projectFixedIncome } from './calculations.js'
import { fixedIncomeProductSchema, type FixedIncomeProduct } from './contracts.js'

const product = (productType: 'cdb' | 'rdb' | 'lc' | 'lci' | 'lca'): FixedIncomeProduct => fixedIncomeProductSchema.parse({
  productType, issuer: { legalName: 'Banco Fixture', conglomerate: 'Grupo confirmado' },
  rate: { kind: 'cdi_percentage', cdiPct: '100' }, issueDate: '2026-08-20', maturityDate: '2027-08-20',
  liquidity: { redemption: 'daily', settlementBusinessDays: 1, gracePeriodEndDate: '2026-11-20' },
  fgc: { status: 'eligible' },
})

describe('bank fixed-income products', () => {
  it.each(['cdb', 'rdb', 'lc'] as const)('applies the versioned taxable rule to %s', (productType) => {
    expect(projectFixedIncome({
      product: product(productType), principalBRL: '1000', calendarDays: 365, businessDays: 252, annualCdiPct: '10',
      acquisitionDate: '2026-08-20', redemptionDate: '2027-08-20',
    })).toMatchObject({ grossBRL: '1100.00', incomeTaxBRL: '17.50', netBRL: '1082.50', taxActionable: true })
  })

  it.each(['lci', 'lca'] as const)('applies the confirmed PF exemption to %s', (productType) => {
    expect(projectFixedIncome({
      product: product(productType), principalBRL: '1000', calendarDays: 365, businessDays: 252, annualCdiPct: '10',
      acquisitionDate: '2026-08-20', redemptionDate: '2027-08-20', exemptionConfirmed: true,
    })).toMatchObject({ grossBRL: '1100.00', incomeTaxBRL: '0.00', netBRL: '1100.00', taxActionable: true })
  })

  it('validates the grace period against issue and maturity dates', () => {
    expect(() => fixedIncomeProductSchema.parse({
      ...product('cdb'), liquidity: { redemption: 'daily', settlementBusinessDays: 1, gracePeriodEndDate: '2028-01-01' },
    })).toThrow(/gracePeriodEndDate/)
  })
})
