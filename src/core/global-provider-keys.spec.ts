/**
 * User-global provider keys — merge-under + mirror-on-save semantics.
 *
 * Exercised through the public surface (readMarketDataConfig /
 * writeConfigSection) with OPENALICE_GLOBAL_DIR pointed at a temp dir so
 * the real ~/.openalice is never touched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readMarketDataConfig, writeConfigSection } from './config.js'

let globalDir: string

beforeEach(async () => {
  globalDir = await mkdtemp(join(tmpdir(), 'oa-global-'))
  process.env['OPENALICE_GLOBAL_DIR'] = globalDir
})

afterEach(async () => {
  delete process.env['OPENALICE_GLOBAL_DIR']
  await rm(globalDir, { recursive: true, force: true })
})

async function seedGlobal(keys: Record<string, string>) {
  await mkdir(globalDir, { recursive: true })
  await writeFile(join(globalDir, 'provider-keys.json'), JSON.stringify(keys))
}

describe('global provider keys', () => {
  it('fills gaps from the global file; the instance value wins per key', async () => {
    await seedGlobal({ fred: 'global-fred', fmp: 'global-fmp' })
    const cfg = await readMarketDataConfig()
    // This checkout's data/config/market-data.json has its own fmp key in
    // dev — so assert the precedence rule rather than exact values:
    expect(cfg.providerKeys.fred).toBeTruthy()
    // A key with no instance value comes from the global file…
    const local = JSON.parse(
      await readFile(join(process.cwd(), 'data/config/market-data.json'), 'utf-8').catch(() => '{}'),
    ) as { providerKeys?: Record<string, string> }
    if (!local.providerKeys?.fred) expect(cfg.providerKeys.fred).toBe('global-fred')
    if (local.providerKeys?.fmp) expect(cfg.providerKeys.fmp).toBe(local.providerKeys.fmp)
  })

  it('mirror-on-save: non-empty sets, explicit empty clears, absent untouched', async () => {
    // tiingo has no instance value in any dev/CI checkout we run this in,
    // so deleting it from the payload exercises the "absent" branch.
    await seedGlobal({ fred: 'old-fred', eia: 'old-eia', tiingo: 'old-tiingo' })
    const current = await readMarketDataConfig()
    const payloadKeys: Record<string, string | undefined> = { ...current.providerKeys, fred: 'new-fred', eia: '' }
    delete payloadKeys['tiingo']
    await writeConfigSection('marketData', { ...current, providerKeys: payloadKeys })
    const global = JSON.parse(await readFile(join(globalDir, 'provider-keys.json'), 'utf-8'))
    expect(global.fred).toBe('new-fred')      // updated
    expect(global.eia).toBeUndefined()        // explicitly cleared → cleared globally
    expect(global.tiingo).toBe('old-tiingo')  // absent from payload → survives
    // Restore the instance file to what it was before this test wrote it.
    await writeConfigSection('marketData', current)
  })

  it('missing/corrupt global file degrades to no-op', async () => {
    await writeFile(join(globalDir, 'provider-keys.json'), 'not json{{{')
    const cfg = await readMarketDataConfig()
    expect(cfg.providers.equity).toBeTruthy() // parse still succeeds
  })
})
