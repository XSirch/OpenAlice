import type { Migration } from '../types.js'
import { defaultAliceInvestConfig, aliceInvestConfigSchema } from '@/domain/alice-invest/config.js'

export const migration: Migration = {
  id: '0026_alice_invest_config',
  appVersion: '0.81.0-beta',
  introducedAt: '2026-07-16',
  affects: ['alice-invest.json'],
  summary: 'Seed the fail-closed Alice Invest configuration.',
  rationale: 'Alice Invest configuration must exist in a known safe state before product capabilities are enabled.',
  async up(ctx) {
    const existing = await ctx.readJson<unknown>('alice-invest.json')
    if (existing === undefined) {
      await ctx.writeJson('alice-invest.json', defaultAliceInvestConfig())
      return
    }
    // A valid existing file is already current. Invalid input is left in place
    // so startup fails closed instead of a migration silently replacing it.
    aliceInvestConfigSchema.parse(existing)
  },
}
