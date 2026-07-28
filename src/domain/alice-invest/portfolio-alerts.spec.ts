import { describe, expect, it } from 'vitest'
import { buildPortfolioAlerts, dedupePortfolioAlerts } from './portfolio-alerts.js'

describe('portfolio alerts', () => {
  it('keeps alerts explainable and deduplicated', () => {
    const fgc: any = { groups: [{ conglomerate: 'Banco A', estimatedUncoveredBRL: '1.00' }], policy: { referenceUrl: 'https://example.test/fgc' } }
    const ladder: any = { asOf: '2026-07-28T00:00:00.000Z', buckets: { past_due: { entries: [] }, up_to_30_days: { entries: [{ id: 'cdb-a', issuer: 'Banco A', productType: 'cdb', maturityDate: '2026-08-01', redemption: 'at_maturity' }] } } }
    const macro: any = [{ dimension: 'liquidity', amountBRL: '100.00', assumptions: ['Scheduled redemption.'], gaps: [] }, { dimension: 'exchange_rate', amountBRL: '0.00', assumptions: [], gaps: ['FX metadata missing.'] }]
    const alerts = buildPortfolioAlerts({ asOf: '2026-07-28T00:00:00.000Z', fgc, ladder, macro, events: [] })
    expect(alerts.map((alert) => alert.kind)).toEqual(expect.arrayContaining(['fgc_concentration', 'maturity', 'liquidity', 'macro_data_gap']))
    expect(alerts.every((alert) => alert.source && alert.asOf && alert.confidence)).toBe(true)
    expect(dedupePortfolioAlerts([...alerts, alerts[0]!])).toHaveLength(alerts.length)
  })
})
