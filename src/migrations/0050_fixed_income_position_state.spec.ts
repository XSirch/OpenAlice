import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ensureFixedIncomePositionState } from './0050_fixed_income_position_state/index.js'

describe('0050 fixed-income position state migration', () => {
  it('creates a private empty state idempotently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-fi-migration-')); const config = join(root, 'config')
    await expect(ensureFixedIncomePositionState(config)).resolves.toEqual({ created: true })
    await expect(ensureFixedIncomePositionState(config)).resolves.toEqual({ created: false })
    expect(JSON.parse(await readFile(join(root, 'state', 'fixed-income-position-state.json'), 'utf8'))).toEqual({ version: 1, records: [] })
  })

  it('rejects an existing malformed state instead of replacing it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-fi-migration-')); const config = join(root, 'config'); const state = join(root, 'state')
    await ensureFixedIncomePositionState(config)
    await writeFile(join(state, 'fixed-income-position-state.json'), '{"version":2}\n', 'utf8')
    await expect(ensureFixedIncomePositionState(config)).rejects.toThrow()
  })
})
