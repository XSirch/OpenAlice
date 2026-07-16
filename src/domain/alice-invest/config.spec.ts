import { describe, expect, it } from 'vitest'
import { normalize } from 'node:path'
import {
  aliceInvestConfigSchema,
  assertSafeAliceInvestRelativePath,
  defaultAliceInvestConfig,
} from './config.js'

describe('Alice Invest safety configuration', () => {
  it('starts fail-closed with every switch disabled', () => {
    expect(defaultAliceInvestConfig()).toMatchObject({
      execution_enabled: false,
      readiness: {
        global: 'not_ready',
        fixed_income: 'research_only',
        crypto_signals: 'research_only',
        b3_signals: 'research_only',
      },
      kill_switches: {
        telegram_inbound_enabled: false,
        market_scans_enabled: false,
        signal_notifications_enabled: false,
        active_signal_monitor_enabled: false,
      },
    })
  })

  it('rejects financial execution and future readiness states', () => {
    expect(() => aliceInvestConfigSchema.parse({ execution_enabled: true })).toThrow()
    expect(() => aliceInvestConfigSchema.parse({ readiness: { global: 'live_execution' } })).toThrow()
  })

  it('rejects path escapes and absolute paths', () => {
    expect(() => assertSafeAliceInvestRelativePath('../escape')).toThrow()
    expect(() => assertSafeAliceInvestRelativePath('/absolute')).toThrow()
    expect(assertSafeAliceInvestRelativePath('signals/current.json')).toBe(normalize('signals/current.json'))
  })
})
