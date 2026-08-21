import { describe, expect, it } from 'vitest'

import { TaxRuleRegistry, taxRuleSetSchema } from './tax-rules.js'

const source = {
  publisher: 'Receita Federal do Brasil',
  sourceId: 'renda-fixa-pf-regra-sintetica-fixture',
  sourceUrl: 'https://www.gov.br/receitafederal/',
  decision: 'manual' as const,
  access: 'official_public_page' as const,
  method: 'manual_upload' as const,
  parameters: {},
  license: 'official_public' as const,
  termsReviewedAt: '2026-08-20',
  termsVersion: 'fixture-2026-08-20',
  retrievedAt: '2026-08-20T12:00:00.000Z',
  dataAsOf: '2026-08-20',
  rawPayloadChecksum: 'a'.repeat(64),
  parserVersion: 'manual-tax-rule@1',
  originalIdentifiers: { rule: 'fixture' },
}

const brackets = [
  { upToDays: 180, rate: '0.225' },
  { upToDays: 360, rate: '0.20' },
  { upToDays: 720, rate: '0.175' },
  { rate: '0.15' },
]

const rules = taxRuleSetSchema.parse({
  version: 1,
  rules: [
    {
      id: 'br-pf-taxable@2026-01', effectiveFrom: '2026-01-01', investorType: 'PF_BR', productTypes: ['cdb'],
      incomeTax: { kind: 'regressive', brackets },
      iof: { kind: 'daily', rates: [{ day: 1, rate: '0.96' }, { day: 29, rate: '0.03' }] },
      exemptionConditions: [], source,
    },
    {
      id: 'br-pf-lci@2026-01', effectiveFrom: '2026-01-01', investorType: 'PF_BR', productTypes: ['lci'],
      incomeTax: { kind: 'conditional_exempt', fallbackBrackets: brackets },
      iof: { kind: 'none' }, exemptionConditions: ['PF exemption confirmed for the event date'], source,
    },
  ],
})

describe('fixed-income tax-rule registry', () => {
  it('selects a dated rule and calculates IR and IOF from versioned data', () => {
    const registry = new TaxRuleRegistry(rules)
    expect(registry.calculate({
      investorType: 'PF_BR', productType: 'cdb', acquisitionDate: '2026-01-01', redemptionDate: '2026-01-02',
      grossIncomeBRL: '100.00', exemptionConfirmed: false,
    })).toMatchObject({ ruleId: 'br-pf-taxable@2026-01', holdingPeriodDays: 1, iofRate: '0.96', iofBRL: '96.00', incomeTaxBRL: '0.90', netIncomeBRL: '3.10', actionable: true })
  })

  it('uses conservative taxation and fails closed when an exemption is unconfirmed', () => {
    const registry = new TaxRuleRegistry(rules)
    expect(registry.calculate({
      investorType: 'PF_BR', productType: 'lci', acquisitionDate: '2026-01-01', redemptionDate: '2027-01-01',
      grossIncomeBRL: '100.00', exemptionConfirmed: false,
    })).toMatchObject({ incomeTaxRate: '0.175', incomeTaxBRL: '17.50', actionable: false, reasons: ['exemption_unconfirmed'] })
    expect(registry.calculate({
      investorType: 'PF_BR', productType: 'lci', acquisitionDate: '2026-01-01', redemptionDate: '2027-01-01',
      grossIncomeBRL: '100.00', exemptionConfirmed: true,
    })).toMatchObject({ incomeTaxRate: '0', incomeTaxBRL: '0.00', actionable: true, reasons: [] })
  })

  it('rejects ambiguous overlapping rules instead of choosing silently', () => {
    expect(() => new TaxRuleRegistry({ version: 1, rules: [rules.rules[0]!, { ...rules.rules[0]!, id: 'duplicate-window' }] })).toThrow(/ambiguous/)
  })
})
