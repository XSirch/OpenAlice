import { describe, expect, it } from 'vitest'

import { migration } from './0049_fixed_income_advisor/index.js'
import type { MigrationContext } from './types.js'

function memoryContext(initial: Record<string, unknown>): { context: MigrationContext; files: Map<string, unknown>; writes: string[] } {
  const files = new Map(Object.entries(initial))
  const writes: string[] = []
  return {
    files,
    writes,
    context: {
      readJson: async <T>(filename: string) => files.get(filename) as T | undefined,
      writeJson: async (filename, data) => { files.set(filename, data); writes.push(filename) },
      removeJson: async (filename) => { files.delete(filename) },
      configDir: () => 'C:\\fixture\\data\\config',
    },
  }
}

describe('0049 fixed-income advisor migration', () => {
  it('seeds a fail-closed policy and preserves generic custody definitions', async () => {
    const custody = { version: 1, entries: [{ source: { provider: 'pluggy', positionId: 'p1' }, product: { productType: 'tesouro_direto' } }] }
    const state = memoryContext({ 'fixed-income-custody.json': custody })

    await migration.up(state.context)
    await migration.up(state.context)

    expect(state.files.get('fixed-income-custody.json')).toEqual(custody)
    expect(state.files.get('fixed-income-advisor-policy.json')).toMatchObject({
      liquidityReservePct: '20', readiness: 'research_only', executionEnabled: false, recommendationGenerationEnabled: false,
    })
    expect(state.writes).toEqual(['fixed-income-advisor-policy.json'])
  })

  it('does not replace an existing valid user policy', async () => {
    const existing = { version: 1, enabled: false, defaultRiskProfile: 'moderate', liquidityReservePct: '30', readiness: 'research_only', executionEnabled: false, recommendationGenerationEnabled: false }
    const state = memoryContext({ 'fixed-income-advisor-policy.json': existing })
    await migration.up(state.context)
    expect(state.files.get('fixed-income-advisor-policy.json')).toEqual(existing)
    expect(state.writes).toEqual([])
  })
})
