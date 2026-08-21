import { describe, expect, it } from 'vitest'
import { scoreBankFromIfData } from './bank-risk.js'

describe('IFData bank risk scoring', () => {
  it('keeps intrinsic, liquidity, regulatory, FGC, and confidence scores separate', () => {
    const result = scoreBankFromIfData({
      institutionCode: 'C0080312', referencePeriod: '202603', active: true,
      baselRatioPct: '15.8333752005285', equityToAssetsPct: '10.341582', returnOnAssetsPct: '1.345',
      liquidAssetsToAssetsPct: '41.966', fgcStatus: 'eligible_confirmed', sourceQualityScore: '95',
    })
    expect(result.intrinsicCreditScore).toBeGreaterThan(60)
    expect(result.liquidityScore).toBe(100)
    expect(result.regulatoryScore).toBe(100)
    expect(result.fgcProtectionScore).toBe(100)
    expect(result.dataConfidenceScore).toBe(95)
    expect(result.methodologyId).toBe('ifdata-bank-risk@1')
  })

  it('does not let FGC repair weak intrinsic credit and reports missing indicators', () => {
    const result = scoreBankFromIfData({
      institutionCode: 'fixture', referencePeriod: '202603', active: true,
      baselRatioPct: '8', fgcStatus: 'eligible_confirmed', sourceQualityScore: '100',
    })
    expect(result.fgcProtectionScore).toBe(100)
    expect(result.intrinsicCreditScore).toBe(0)
    expect(result.dataConfidenceScore).toBeLessThan(50)
    expect(result.gaps).toContain('equity_to_assets_missing')
  })
})
