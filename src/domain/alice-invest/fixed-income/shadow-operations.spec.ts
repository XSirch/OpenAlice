import { describe, expect, it, vi } from 'vitest'

import { collectFixedIncomeShadowArtifact, renderFixedIncomeShadowReportMarkdown } from './shadow-operations.js'

const observation = {
  id: 'official-2026-08-21', observedAt: '2026-08-21T12:00:00.000Z', referenceId: 'official-reference',
  calculationTraceId: 'a'.repeat(64), expectedNetBRL: '1000', actualNetBRL: '999.99', staleDataCount: 0,
  providerFailureCount: 0, alertCount: 0, duplicateAlertCount: 0, reviewedAlertCount: 0, falsePositiveCount: 0,
  thresholdVariant: 'approved-defaults', sourceChecksum: 'b'.repeat(64),
}

describe('fixed-income shadow operations', () => {
  it('collects a bounded artifact idempotently through the store boundary', async () => {
    const append = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(collectFixedIncomeShadowArtifact({ version: 1, observations: [observation, { ...observation, id: 'official-2026-08-21-b' }] }, { append })).resolves.toEqual({ accepted: 1, replayed: 1 })
    expect(append).toHaveBeenCalledTimes(2)
    await expect(collectFixedIncomeShadowArtifact({ version: 1, observations: [observation], action: 'enable' }, { append })).rejects.toThrow()
  })

  it('renders a transparent read-only evidence report', () => {
    const markdown = renderFixedIncomeShadowReportMarkdown({
      state: 'collecting', distinctObservationDays: 1, observationCount: 1, period: { from: '2026-08-21', to: '2026-08-21' },
      metrics: { staleDataEvents: 0, providerFailures: 0, alerts: 0, duplicateAlerts: 0, reviewedAlerts: 0, falsePositives: 0, falsePositiveRatePct: '0.00000000' },
      maximumAbsoluteCalculationDifferenceBRL: '0.01', thresholdSensitivity: [], blockers: ['minimum_30_distinct_days_not_met'], walkthrough: null,
      methodologyId: 'fixed-income-shadow-validation@1', readiness: 'research_only', canEnableRecommendations: false,
    })
    expect(markdown).toContain('Observation days: 1/30')
    expect(markdown).toContain('Financial execution: unavailable')
    expect(markdown).toContain('minimum_30_distinct_days_not_met')
  })
})
