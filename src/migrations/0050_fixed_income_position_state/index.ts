import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { fixedIncomePositionStateFileSchema } from '../../domain/alice-invest/fixed-income/position-state.js'
import type { Migration } from '../types.js'

export async function ensureFixedIncomePositionState(configDir: string): Promise<{ created: boolean }> {
  const path = resolve(configDir, '..', 'state', 'fixed-income-position-state.json')
  try {
    fixedIncomePositionStateFileSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    return { created: false }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(path, `${JSON.stringify({ version: 1, records: [] })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await chmod(path, 0o600).catch(() => undefined)
    return { created: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      fixedIncomePositionStateFileSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      return { created: false }
    }
    throw error
  }
}

export const migration: Migration = {
  id: '0050_fixed_income_position_state', appVersion: '0.90.0-beta', introducedAt: '2026-08-20',
  affects: ['state/fixed-income-position-state.json'],
  summary: 'Create private versioned evidence and calculation memory for fixed-income positions.',
  rationale: 'Position lots, cash flows, risk evidence, documents, and deterministic calculation traces must survive restart without entering custody configuration or UTA state.',
  up: async (ctx) => { await ensureFixedIncomePositionState(ctx.configDir()) },
}
