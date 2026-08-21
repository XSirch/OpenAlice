import { describe, expect, it } from 'vitest'

import { simulateFixedIncomeSwitch } from './switch-analysis.js'

const source = {
  publisher: 'Synthetic PRD fixture', sourceId: 'prd-case-33', sourceUrl: 'https://openalice.local/fixtures/prd-case-33',
  decision: 'manual' as const, access: 'user_supplied' as const, method: 'manual_upload' as const, parameters: {},
  license: 'user_supplied' as const, termsReviewedAt: '2026-08-20', termsVersion: 'prd-v1',
  retrievedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-20', rawPayloadChecksum: 'c'.repeat(64),
  parserVersion: 'prd-fixture@1', originalIdentifiers: { case: '33' },
}

const syntheticCase = {
  asOf: '2026-08-20T12:00:00.000Z', targetDate: '2031-08-20', sellFraction: '1', sameInstrument: false,
  hold: { principalBRL: '100000', annualIndexPct: '4', annualSpreadPct: '6', yearsFromAcquisition: '7', incomeTaxRate: '0.15', futureCostsBRL: '1500' },
  sale: { grossProceedsBRL: '130000', realizedIncomeTaxBRL: '4500', exitCostsBRL: '260' },
  replacement: { annualRatePct: '10.5', years: '5', incomeTaxRate: '0', costsBRL: '0', availability: 'confirmed', validUntil: '2026-08-20T12:30:00.000Z', fgcConfirmed: true },
  constraints: {
    portfolioTotalBRL: '600000', liquidReserveAfterBRL: '150000', minimumReservePct: '20', concentrationValid: true,
    dataQuality: '85', minimumDataQuality: '85', confidence: '80', minimumConfidence: '80', uncertaintyBRL: '10000', minimumBenefitUncertaintyRatio: '2',
    minimumBenefitBRL: '500', criticalDataFresh: true,
  },
  annualCdiPct: '10', sources: [source],
} satisfies Parameters<typeof simulateFixedIncomeSwitch>[0]

describe('fixed-income switch analysis', () => {
  it('reproduces the PRD Tesouro IPCA+ synthetic case on the same horizon', () => {
    expect(simulateFixedIncomeSwitch(syntheticCase)).toMatchObject({
      decision: 'sell_and_reinvest', actionable: false, readiness: 'research_only',
      hold: { grossFinalBRL: '197867.48', incomeTaxBRL: '14680.12', netFinalBRL: '181687.36' },
      sell: { netReinvestableBRL: '125240.00' },
      reinvest: { netFinalBRL: '206326.23' },
      delta: { netBRL: '24638.87', annualizedUpliftPct: '2.57604408' },
      breakEven: { annualNetRatePct: '7.72495761', annualGrossRatePct: '7.72495761', cdiEquivalentPct: '77.24957608' },
    })
  })

  it('fails the reserve gate and never emits a sell decision below 20 percent', () => {
    const result = simulateFixedIncomeSwitch({
      ...syntheticCase,
      constraints: { ...syntheticCase.constraints, liquidReserveAfterBRL: '110000' },
    })
    expect(result.decision).toBe('maintain')
    expect(result.constraints.find((constraint) => constraint.id === 'liquidity_reserve')).toMatchObject({ passed: false, actual: '18.33333333', required: '20' })
  })

  it('enforces the no-false-arbitrage invariant for an immediate same-title repurchase', () => {
    const result = simulateFixedIncomeSwitch({
      ...syntheticCase,
      sameInstrument: true,
      replacement: { ...syntheticCase.replacement, annualRatePct: '11' },
    })
    expect(result.decision).toBe('maintain')
    expect(result.constraints.find((constraint) => constraint.id === 'false_arbitrage')).toMatchObject({ passed: false })
    expect(result.reasons).toContain('false_arbitrage_invariant')
  })

  it('fails closed on stale critical data and distinguishes a partial sale', () => {
    expect(simulateFixedIncomeSwitch({
      ...syntheticCase, constraints: { ...syntheticCase.constraints, criticalDataFresh: false },
    }).decision).toBe('insufficient_data')
    expect(simulateFixedIncomeSwitch({ ...syntheticCase, sellFraction: '0.5' }).decision).toBe('sell_partial')
  })

  it('preserves monotonicity for replacement rates and costs', () => {
    const base = simulateFixedIncomeSwitch(syntheticCase)
    const lowerRate = simulateFixedIncomeSwitch({ ...syntheticCase, replacement: { ...syntheticCase.replacement, annualRatePct: '9' } })
    const higherCosts = simulateFixedIncomeSwitch({ ...syntheticCase, replacement: { ...syntheticCase.replacement, costsBRL: '1000' } })
    expect(Number(lowerRate.reinvest.netFinalBRL)).toBeLessThan(Number(base.reinvest.netFinalBRL))
    expect(Number(higherCosts.reinvest.netFinalBRL)).toBeLessThan(Number(base.reinvest.netFinalBRL))
  })
})
