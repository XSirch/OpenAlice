import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { fixedIncomeShadowFileSchema, fixedIncomeShadowFileV1Schema } from '../../domain/alice-invest/fixed-income/shadow-validation.js'
import type { Migration } from '../types.js'

export async function migrateFixedIncomeShadowWalkthrough(configDir: string): Promise<{ created: boolean; upgraded: boolean }> {
  const path = resolve(configDir, '..', 'state', 'fixed-income-shadow-validation.json')
  let next: unknown
  let created = false
  try {
    const current = JSON.parse(await readFile(path, 'utf8')) as unknown
    const v2 = fixedIncomeShadowFileSchema.safeParse(current)
    if (v2.success) return { created: false, upgraded: false }
    const v1 = fixedIncomeShadowFileV1Schema.parse(current)
    next = { version: 2, observations: v1.observations, walkthroughs: [] }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    created = true
    next = { version: 2, observations: [], walkthroughs: [] }
  }

  const parsed = fixedIncomeShadowFileSchema.parse(next)
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.migration-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(parsed)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, path)
  await chmod(path, 0o600).catch(() => undefined)
  return { created, upgraded: true }
}

export const migration: Migration = {
  id: '0051_fixed_income_shadow_walkthrough', appVersion: '0.90.0-beta', introducedAt: '2026-08-21',
  affects: ['state/fixed-income-shadow-validation.json'],
  summary: 'Upgrade fixed-income shadow evidence to persist append-only human walkthroughs.',
  rationale: 'The readiness report must survive restart and must not remain permanently blocked by an in-memory-only human review.',
  up: async (ctx) => { await migrateFixedIncomeShadowWalkthrough(ctx.configDir()) },
}
