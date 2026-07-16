import { describe, expect, it } from 'vitest'
import { incomeTaxRate, iofRate, projectFixedIncome } from './calculations.js'
import { fixedIncomeProductSchema } from './contracts.js'
const product = fixedIncomeProductSchema.parse({ productType:'cdb', issuer:{legalName:'Banco'}, rate:{kind:'fixed',annualRatePct:'10'}, issueDate:'2026-01-01',maturityDate:'2027-01-01',liquidity:{redemption:'daily',settlementBusinessDays:1},fgc:{eligible:true} })
describe('fixed income calculations', () => {
  it('uses Decimal projection and regressive tax boundaries', () => { expect(incomeTaxRate(180).toString()).toBe('0.225'); expect(incomeTaxRate(181).toString()).toBe('0.2'); expect(projectFixedIncome({product,principalBRL:'1000',calendarDays:365,businessDays:252})).toMatchObject({grossBRL:'1100.00',incomeTaxRate:'0.175',netBRL:'1082.50'}) })
  it('applies IOF only through day 29 and exempts LCI/LCA from IR', () => { expect(iofRate(1).toString()).toBe('0.96'); expect(iofRate(30).toString()).toBe('0'); const lci=fixedIncomeProductSchema.parse({...product,productType:'lci'}); expect(projectFixedIncome({product:lci,principalBRL:'1000',calendarDays:365,businessDays:252}).incomeTaxBRL).toBe('0.00') })
})
