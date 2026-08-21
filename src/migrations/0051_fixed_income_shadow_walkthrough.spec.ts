import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { migrateFixedIncomeShadowWalkthrough } from './0051_fixed_income_shadow_walkthrough/index.js'

describe('0051 fixed-income shadow walkthrough migration', () => {
  it('upgrades version one without losing observations and is idempotent', async () => {
    const home = await mkdtemp(join(tmpdir(), 'fixed-income-shadow-migration-'))
    const config = join(home, 'data', 'config')
    const path = resolve(config, '..', 'state', 'fixed-income-shadow-validation.json')
    await mkdir(resolve(config, '..', 'state'), { recursive: true })
    const observation = { id: 'official-2026-08-21', observedAt: '2026-08-21T12:00:00.000Z', referenceId: 'official-reference', calculationTraceId: 'a'.repeat(64), expectedNetBRL: '1000', actualNetBRL: '999.99', staleDataCount: 0, providerFailureCount: 0, alertCount: 0, duplicateAlertCount: 0, reviewedAlertCount: 0, falsePositiveCount: 0, thresholdVariant: 'approved-defaults', sourceChecksum: 'b'.repeat(64) }
    await writeFile(path, `${JSON.stringify({ version: 1, observations: [observation] })}\n`, 'utf8')
    await expect(migrateFixedIncomeShadowWalkthrough(config)).resolves.toEqual({ created: false, upgraded: true })
    await expect(migrateFixedIncomeShadowWalkthrough(config)).resolves.toEqual({ created: false, upgraded: false })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ version: 2, observations: [observation], walkthroughs: [] })
  })

  it('creates an empty version-two file when no prior state exists', async () => {
    const home = await mkdtemp(join(tmpdir(), 'fixed-income-shadow-migration-'))
    const config = join(home, 'data', 'config')
    await expect(migrateFixedIncomeShadowWalkthrough(config)).resolves.toEqual({ created: true, upgraded: true })
    expect(JSON.parse(await readFile(resolve(config, '..', 'state', 'fixed-income-shadow-validation.json'), 'utf8'))).toEqual({ version: 2, observations: [], walkthroughs: [] })
  })
})
