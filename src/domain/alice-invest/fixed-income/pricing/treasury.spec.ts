import { describe, expect, it } from 'vitest'

import { fixedIncomeCalendarSchema } from '../calendars.js'
import { buildTreasuryCashFlowSchedule, priceTreasuryCashFlows, priceTreasuryScenarios, projectTreasuryIndexedNotional } from './treasury.js'

const calendar = fixedIncomeCalendarSchema.parse({
  id: 'br-business-fixture', version: '2026', validFrom: '2026-01-01', validTo: '2027-12-31',
  weekendDays: [0, 6], holidays: [],
  source: { sourceId: 'fixture', reviewedAt: '2026-08-20', checksum: 'a'.repeat(64) },
})
const source = {
  publisher: 'Tesouro Nacional', sourceId: 'tesouro-fixture', sourceUrl: 'https://www.tesourotransparente.gov.br/',
  decision: 'automate' as const, access: 'official_public_download' as const, method: 'GET' as const, parameters: {},
  license: 'open_data' as const, termsReviewedAt: '2026-08-20', termsVersion: 'fixture',
  retrievedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-19', rawPayloadChecksum: 'b'.repeat(64),
  parserVersion: 'fixture@1', originalIdentifiers: {},
}

describe('Tesouro deterministic pricing', () => {
  it('prices nominal flows and calculates duration, convexity, and DV01', () => {
    expect(priceTreasuryCashFlows({
      valuationDate: '2026-01-01', yieldAnnualPct: '10', accruedInterestBRL: '0', faceValueBRL: '1000', calendar,
      cashFlows: [{ id: 'principal', instrumentId: 'lt-1', date: '2026-12-21', kind: 'principal', grossBRL: '1000', status: 'announced' }],
      methodologyId: 'tesouro-nominal-252@1', sources: [source],
    })).toMatchObject({
      dirtyPriceBRL: '909.09', cleanPriceBRL: '909.09', macaulayDurationYears: '1.00000000',
      modifiedDurationYears: '0.90909091', convexity: '1.65289256', dv01BRL: '0.08264463',
      premiumDiscountBRL: '-90.91', methodologyId: 'tesouro-nominal-252@1',
    })
  })

  it('projects an indexed notional with an explicit lag and methodology', () => {
    expect(projectTreasuryIndexedNotional({
      baseNotionalBRL: '1000', baseReferenceDate: '2026-01-01', targetDate: '2027-03-01',
      annualIndexPct: '4', indexLagMonths: 2, methodologyId: 'synthetic-ipca-lag@1',
    })).toEqual({
      projectedNotionalBRL: '1040.00', effectiveIndexDate: '2027-01-01', indexAccrualDays: 365,
      methodologyId: 'synthetic-ipca-lag@1',
    })
  })

  it('returns base, favorable, adverse, and stress prices without invented probabilities', () => {
    const result = priceTreasuryScenarios({
      valuationDate: '2026-01-01', accruedInterestBRL: '0', faceValueBRL: '1000', calendar,
      cashFlows: [{ id: 'principal', instrumentId: 'lt-1', date: '2026-12-21', kind: 'principal', grossBRL: '1000', status: 'announced' }],
      methodologyId: 'tesouro-scenarios@1', sources: [source],
      scenarios: [
        { id: 'base', yieldAnnualPct: '10' }, { id: 'favorable', yieldAnnualPct: '9' },
        { id: 'adverse', yieldAnnualPct: '11' }, { id: 'stress', yieldAnnualPct: '13' },
      ],
    })
    expect(result.scenarios.map((scenario) => scenario.id)).toEqual(['base', 'favorable', 'adverse', 'stress'])
    expect(result.interval).toEqual({ minimumBRL: '884.96', maximumBRL: '917.43' })
    expect(result.probabilityWeightedPriceBRL).toBeNull()
  })

  it('builds settlement, coupon, amortization, and remaining-principal flows', () => {
    const result = buildTreasuryCashFlowSchedule({
      instrumentId: 'ntn-fixture', tradeDate: '2026-01-02', settlementBusinessDays: 1,
      maturityDate: '2026-12-21', originalPrincipalBRL: '1000', calendar,
      couponEvents: [
        { date: '2026-06-30', ratePctOfOutstanding: '5' },
        { date: '2026-12-21', ratePctOfOutstanding: '5' },
      ],
      amortizationEvents: [{ date: '2026-06-30', fractionOfOriginal: '0.25' }],
      generatedAt: '2026-01-02T12:00:00.000Z', methodologyId: 'tesouro-explicit-events@1', sources: [source],
    })
    expect(result.settlementDate).toBe('2026-01-05')
    expect(result.schedule.cashFlows.map((flow) => [flow.date, flow.kind, flow.grossBRL])).toEqual([
      ['2026-06-30', 'coupon', '50.00'], ['2026-06-30', 'amortization', '250.00'],
      ['2026-12-21', 'coupon', '37.50'], ['2026-12-21', 'principal', '750.00'],
    ])
  })
})
