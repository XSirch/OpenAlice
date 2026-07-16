import { describe, expect, it, vi } from 'vitest'
import type { MigrationContext } from '../types.js'
import { migration } from './index.js'

describe('0025 connector inbound journal', () => {
  it('seeds once and preserves an existing journal', async () => {
    const writeJson = vi.fn(async () => undefined)
    const readJson = vi.fn<() => Promise<unknown | undefined>>(async () => undefined)
    const ctx = { readJson, writeJson, removeJson: vi.fn(), configDir: () => 'config' }
    await migration.up(ctx as unknown as MigrationContext)
    expect(writeJson).toHaveBeenCalledWith('connector-inbound-journal.json', { version: 1, entries: [] })
    readJson.mockResolvedValueOnce({ version: 1, entries: [{ dedupeKey: 'pending' }] })
    await migration.up(ctx as unknown as MigrationContext)
    expect(writeJson).toHaveBeenCalledTimes(1)
  })
})
