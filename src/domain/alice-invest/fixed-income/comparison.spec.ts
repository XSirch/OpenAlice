import { describe, expect, it } from 'vitest'
import { compareFixedIncome } from './comparison.js'
import { fixedIncomeProductSchema } from './contracts.js'
const product=(type:'cdb'|'lci',name:string,rate:string,fgc:boolean)=>fixedIncomeProductSchema.parse({productType:type,issuer:{legalName:name},rate:{kind:'fixed',annualRatePct:rate},issueDate:'2026-01-01',maturityDate:'2027-01-01',liquidity:{redemption:'at_maturity',settlementBusinessDays:1},fgc:{eligible:fgc},assumptions:['rate held']})
describe('fixed income comparison',()=>{
  it('compares return, issuer, liquidity, maturity and FGC without a recommendation',()=>{const out=compareFixedIncome([{product:product('cdb','Banco A','10',true),principalBRL:'1000',calendarDays:365,businessDays:252},{product:product('lci','Banco B','9',false),principalBRL:'1000',calendarDays:365,businessDays:252}]);expect(out.entries).toHaveLength(2);expect(out.entries.find(x=>x.issuer==='Banco A')).toMatchObject({redemption:'at_maturity',fgcEligible:true});expect(out.disclaimer).toMatch(/not an investment recommendation/);expect(out.entries.find(x=>x.issuer==='Banco B')?.gaps).toContain('FGC eligibility is not available')})
})
