import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFixedIncomeShadowReport, FixedIncomeShadowValidationStore } from './shadow-validation.js'

const observation = (day: number, overrides: Record<string, unknown> = {}) => ({
  id: `obs-${day}`, observedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
  referenceId: `official-${day}`, calculationTraceId: `${String(day % 10)}`.repeat(64),
  expectedNetBRL: '100000.00', actualNetBRL: '100010.00', staleDataCount: 0, providerFailureCount: 0,
  alertCount: 1, duplicateAlertCount: 0, reviewedAlertCount: 1, falsePositiveCount: 0,
  thresholdVariant: 'approved-defaults', sourceChecksum: 'a'.repeat(64), ...overrides,
})

describe('fixed-income shadow validation', () => {
  it('requires thirty distinct observation days and a human walkthrough', () => {
    const incomplete = buildFixedIncomeShadowReport({ observations: Array.from({ length: 29 }, (_, index) => observation(index + 1)), walkthrough: null })
    expect(incomplete).toMatchObject({ state: 'collecting', distinctObservationDays: 29, readiness: 'research_only', canEnableRecommendations: false })
    expect(incomplete.blockers).toEqual(expect.arrayContaining(['minimum_30_distinct_days_not_met', 'human_walkthrough_missing']))
    const complete = buildFixedIncomeShadowReport({
      observations: Array.from({ length: 30 }, (_, index) => observation(index + 1)),
      walkthrough: { completedAt: '2026-10-01T12:00:00.000Z', reviewer: 'human-maintainer', result: 'passed', notes: 'Cálculos e fontes revisados.' },
    })
    expect(complete).toMatchObject({ state: 'eligible_for_human_readiness_decision', distinctObservationDays: 30, readiness: 'research_only', canEnableRecommendations: false })
    expect(complete.metrics).toMatchObject({ providerFailures: 0, duplicateAlerts: 0, falsePositives: 0, reviewedAlerts: 30 })
  })

  it('reports stale data, failures, duplicates, false positives, and sensitivity without hiding them', () => {
    const report = buildFixedIncomeShadowReport({
      observations: [
        observation(1, { staleDataCount: 2, providerFailureCount: 1, duplicateAlertCount: 1, falsePositiveCount: 1, thresholdVariant: 'strict' }),
        observation(2, { expectedNetBRL: '100000', actualNetBRL: '101000', thresholdVariant: 'permissive' }),
      ], walkthrough: null,
    })
    expect(report.metrics).toMatchObject({ staleDataEvents: 2, providerFailures: 1, duplicateAlerts: 1, falsePositives: 1 })
    expect(report.thresholdSensitivity.map((item) => item.variant)).toEqual(['permissive', 'strict'])
    expect(report.maximumAbsoluteCalculationDifferenceBRL).toBe('1000.00')
  })

  it('rejects duplicate observation IDs and conflicting trace/source evidence', () => {
    expect(() => buildFixedIncomeShadowReport({ observations: [observation(1), observation(1)], walkthrough: null })).toThrow(/duplicate observation id/)
  })

  it('persists observations idempotently and rejects conflicting replays', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fixed-income-shadow-'))
    const store = new FixedIncomeShadowValidationStore(join(directory, 'shadow.json'))
    expect(await store.append(observation(1))).toBe(true)
    expect(await store.append(observation(1))).toBe(false)
    await expect(store.append(observation(1, { actualNetBRL: '99999' }))).rejects.toThrow(/conflicting shadow observation id/)
    const restarted = new FixedIncomeShadowValidationStore(join(directory, 'shadow.json'))
    expect((await restarted.report()).distinctObservationDays).toBe(1)
    const walkthrough = { completedAt: '2026-10-01T12:00:00.000Z', reviewer: 'human-maintainer', result: 'passed' as const, notes: 'Cálculos e fontes revisados.' }
    expect(await restarted.recordWalkthrough(walkthrough)).toBe(true)
    expect(await restarted.recordWalkthrough(walkthrough)).toBe(false)
    expect((await new FixedIncomeShadowValidationStore(join(directory, 'shadow.json')).report()).walkthrough).toEqual(walkthrough)
    await expect(restarted.recordWalkthrough({ ...walkthrough, notes: 'Conflito.' })).rejects.toThrow(/conflicting shadow walkthrough/)
  })
})
