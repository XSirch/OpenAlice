import { describe, expect, it, vi } from 'vitest'
import { migration } from './index.js'

describe('0026_alice_invest_config', () => {
  it('seeds a fail-closed config only when absent', async () => {
    const writeJson = vi.fn().mockResolvedValue(undefined)
    await migration.up({
      readJson: vi.fn().mockResolvedValue(undefined),
      writeJson,
      removeJson: vi.fn(),
      configDir: () => '/config',
    })
    expect(writeJson).toHaveBeenCalledWith('alice-invest.json', expect.objectContaining({ execution_enabled: false }))
  })

  it('is idempotent for the current shape', async () => {
    const writeJson = vi.fn()
    await migration.up({
      readJson: vi.fn().mockResolvedValue({
        version: 1,
        execution_enabled: false,
        readiness: {},
        kill_switches: {},
        limits: {},
        security: {},
      }),
      writeJson,
      removeJson: vi.fn(),
      configDir: () => '/config',
    })
    expect(writeJson).not.toHaveBeenCalled()
  })
})
