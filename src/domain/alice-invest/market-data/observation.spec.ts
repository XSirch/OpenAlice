import { describe, expect, it } from 'vitest'
import { assessObservationFreshness, normalizedMarketObservationSchema } from './observation.js'

const receivedAt = '2026-07-16T12:00:10.000Z'
describe('normalized market observation', () => {
  it('does not presume realtime capability and preserves optional quote fields', () => {
    const observation = normalizedMarketObservationSchema.parse({ source: 'fixture', symbol: 'PETR4', sourceTimestamp: '2026-07-16T12:00:00.000Z', receivedAt, bid: '30.01', ask: '30.02', spread: '0.01', volume: '1000' })
    expect(observation.capability).toBe('unknown')
    expect(assessObservationFreshness(observation, 30)).toMatchObject({ ageSeconds: 10, fresh: false })
  })
  it('requires timestamps and rejects stale realtime observations', () => {
    expect(() => normalizedMarketObservationSchema.parse({ source: 'x', symbol: 'BTC', receivedAt })).toThrow()
    const observation = normalizedMarketObservationSchema.parse({ source: 'fixture', symbol: 'BTC', sourceTimestamp: '2026-07-16T11:59:00.000Z', receivedAt, capability: 'realtime' })
    expect(assessObservationFreshness(observation, 30)).toMatchObject({ ageSeconds: 70, fresh: false })
  })
})
