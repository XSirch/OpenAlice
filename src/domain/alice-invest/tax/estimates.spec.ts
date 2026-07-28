import { describe, expect, it } from 'vitest'
import { estimateBrazilTax } from './estimates.js'

describe('Brazil tax estimates', () => {
  it('separates B3 cash equity monthly exemption from taxable ordinary operations', () => {
    expect(estimateBrazilTax({ assetClass: 'b3_equity_common', grossSalesBRL: '20000', netGainBRL: '1000', hasRequiredRecords: true })).toMatchObject({ status: 'estimated', estimatedTaxBRL: '0.00' })
    expect(estimateBrazilTax({ assetClass: 'b3_equity_common', grossSalesBRL: '20000.01', netGainBRL: '1000', hasRequiredRecords: true })).toMatchObject({ status: 'estimated', estimatedTaxBRL: '150.00' })
  })
  it('keeps FII, fixed income, funds and crypto in distinct lanes with visible gaps', () => {
    expect(estimateBrazilTax({ assetClass: 'b3_fii', netGainBRL: '1000', hasRequiredRecords: true })).toMatchObject({ estimatedTaxBRL: '200.00' })
    expect(estimateBrazilTax({ assetClass: 'fixed_income', netGainBRL: '1000', calendarDays: 721, hasRequiredRecords: true })).toMatchObject({ estimatedTaxBRL: '150.00' })
    expect(estimateBrazilTax({ assetClass: 'fund', netGainBRL: '1000', hasRequiredRecords: true })).toMatchObject({ status: 'unassessable' })
    expect(estimateBrazilTax({ assetClass: 'crypto', netGainBRL: '1000', hasRequiredRecords: true })).toMatchObject({ status: 'unassessable' })
  })
  it('does not estimate a day-trade or incomplete position', () => {
    expect(estimateBrazilTax({ assetClass: 'b3_equity_common', grossSalesBRL: '30000', netGainBRL: '1000', hasDayTrade: true, hasRequiredRecords: true })).toMatchObject({ status: 'unassessable' })
    expect(estimateBrazilTax({ assetClass: 'b3_fii', netGainBRL: '1000', hasRequiredRecords: false })).toMatchObject({ status: 'unassessable' })
  })
})
