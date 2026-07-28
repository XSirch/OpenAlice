import type { Migration } from '../types.js'
import { defaultBrazilTaxPolicy } from '../../domain/alice-invest/tax/contracts.js'

export const migration: Migration = {
  id: '0038_alice_invest_tax_policy',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-28',
  affects: ['alice-invest-tax-policy.json'],
  summary: 'Seed fail-closed Brazilian tax-estimation policy and source requirements.',
  async up(ctx) {
    if (await ctx.readJson('alice-invest-tax-policy.json') === undefined) {
      await ctx.writeJson('alice-invest-tax-policy.json', defaultBrazilTaxPolicy)
    }
  },
}
