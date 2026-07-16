import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home: string
let savedHome: string | undefined

async function loadModule() {
  vi.resetModules()
  process.env['OPENALICE_HOME'] = home
  return import('./alice-invest-config.js')
}

beforeEach(async () => {
  savedHome = process.env['OPENALICE_HOME']
  home = await mkdtemp(join(tmpdir(), 'openalice-invest-config-'))
})

afterEach(async () => {
  if (savedHome === undefined) delete process.env['OPENALICE_HOME']
  else process.env['OPENALICE_HOME'] = savedHome
  await rm(home, { recursive: true, force: true })
})

describe('Alice Invest config store', () => {
  it('returns fail-closed defaults when the store is absent', async () => {
    const config = await loadModule()
    await expect(config.readAliceInvestConfig()).resolves.toMatchObject({
      execution_enabled: false,
      readiness: { global: 'not_ready' },
      kill_switches: { telegram_inbound_enabled: false },
    })
  })

  it('writes atomically private JSON and rejects execution on read', async () => {
    const config = await loadModule()
    const value = await config.readAliceInvestConfig()
    await config.writeAliceInvestConfig(value)
    const path = join(home, 'data', 'config', 'alice-invest.json')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ execution_enabled: false })
    await expect(config.readAliceInvestConfig()).resolves.toEqual(value)
    await expect(config.writeAliceInvestConfig({ ...value, execution_enabled: true } as never)).rejects.toThrow()
  })
})
