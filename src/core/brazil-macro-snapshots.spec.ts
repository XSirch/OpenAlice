import { describe, expect, it } from 'vitest'
import { mergeBrazilMacroSnapshots, type BrazilMacroSnapshot } from './brazil-macro-snapshots.js'

const entry = (value: number, collectedAt: string): BrazilMacroSnapshot => ({ seriesId: 'SGS 432', dataAsOf: '2026-07-20', value, provider: 'Banco Central do Brasil', collectedAt })

describe('Brazil macro snapshots', () => {
  it('deduplicates an identical observation but preserves changed values as revisions', () => {
    const snapshots = mergeBrazilMacroSnapshots([entry(14.25, '2026-07-21T10:00:00.000Z')], [entry(14.25, '2026-07-22T10:00:00.000Z'), entry(14.5, '2026-07-23T10:00:00.000Z')])
    expect(snapshots).toEqual([entry(14.25, '2026-07-22T10:00:00.000Z'), entry(14.5, '2026-07-23T10:00:00.000Z')])
  })
  it('bounds the durable history to the newest 2,000 observations', () => {
    const snapshots = mergeBrazilMacroSnapshots([], Array.from({ length: 2_001 }, (_, index) => ({ seriesId: `S${index}`, dataAsOf: '2026-07-20', value: index, provider: 'test', collectedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString() })))
    expect(snapshots).toHaveLength(2_000)
    expect(snapshots[0]?.seriesId).toBe('S1')
  })
})
