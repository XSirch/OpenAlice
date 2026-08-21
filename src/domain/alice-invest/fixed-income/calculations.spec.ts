import { describe, expect, it } from 'vitest'
import { incomeTaxRate, iofRate, projectFixedIncome } from './calculations.js'
import { fixedIncomeProductSchema } from './contracts.js'
const product = fixedIncomeProductSchema.parse({ productType:'cdb', issuer:{legalName:'Banco'}, rate:{kind:'fixed',annualRatePct:'10'}, issueDate:'2026-01-01',maturityDate:'2027-01-01',liquidity:{redemption:'daily',settlementBusinessDays:1},fgc:{status:'eligible'} })
describe('fixed income calculations', () => {
  it('uses Decimal projection and a versioned tax rule at regressive boundaries', () => { expect(incomeTaxRate(180).toString()).toBe('0.225'); expect(incomeTaxRate(181).toString()).toBe('0.2'); expect(projectFixedIncome({product,principalBRL:'1000',calendarDays:365,businessDays:252})).toMatchObject({grossBRL:'1100.00',incomeTaxRate:'0.175',netBRL:'1082.50',taxRuleId:'br-pf-renda-fixa-tributavel@2026-01',taxActionable:true,taxReasons:[]}) })
  it('emits a deterministic calculation trace and source provenance', () => {
    const first = projectFixedIncome({ product, principalBRL: '1000', calendarDays: 365, businessDays: 252 })
    const second = projectFixedIncome({ product, principalBRL: '1000', calendarDays: 365, businessDays: 252 })
    expect(first.calculationTraceId).toMatch(/^[a-f0-9]{64}$/)
    expect(second.calculationTraceId).toBe(first.calculationTraceId)
    expect(first.methodologyIds).toEqual(['fixed-income-projection@2', 'br-pf-renda-fixa-tributavel@2026-01'])
    expect(first.sources.map((source) => source.sourceId)).toContain('receita.tributacao-2026.renda-fixa')
  })
  it('applies IOF only through day 29 and exempts LCI/LCA from IR', () => { expect(iofRate(1).toString()).toBe('0.96'); expect(iofRate(30).toString()).toBe('0'); const lci=fixedIncomeProductSchema.parse({...product,productType:'lci'}); expect(projectFixedIncome({product:lci,principalBRL:'1000',calendarDays:365,businessDays:252}).incomeTaxBRL).toBe('0.00') })
  it('supports the expanded indexed rates and fails closed for custom methodologies', () => {
    const cdiPlus = fixedIncomeProductSchema.parse({ ...product, rate: { kind: 'cdi_plus', spreadPct: '1' } })
    expect(projectFixedIncome({ product: cdiPlus, principalBRL: '1000', calendarDays: 365, businessDays: 252, annualCdiPct: '10' }).grossBRL).toBe('1111.00')
    const custom = fixedIncomeProductSchema.parse({ ...product, rate: { kind: 'custom', label: 'Contrato', methodologyId: 'custom@1' } })
    expect(() => projectFixedIncome({ product: custom, principalBRL: '1000', calendarDays: 365, businessDays: 252 })).toThrow(/custom rate methodology/)
  })
  it('uses conservative IR when an expanded exempt instrument is not confirmed', () => {
    const cri = fixedIncomeProductSchema.parse({ ...product, productType: 'cri' })
    expect(projectFixedIncome({ product: cri, principalBRL: '1000', calendarDays: 365, businessDays: 252 })).toMatchObject({
      incomeTaxRate: '0.175', incomeTaxBRL: '17.50', taxActionable: false, taxReasons: ['exemption_unconfirmed'],
    })
  })
})
