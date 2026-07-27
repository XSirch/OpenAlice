import type { Migration } from '../types.js'

/** Reserve user-owned classifications for read-only fixed-income custody. */
export const migration: Migration = {
  id: '0035_fixed_income_custody',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-27',
  affects: ['fixed-income-custody.json'],
  summary: 'Seed explicit fixed-income custody classifications without inferring issuer or FGC data.',
  async up(ctx) {
    if (await ctx.readJson('fixed-income-custody.json') === undefined) {
      await ctx.writeJson('fixed-income-custody.json', { version: 1, entries: [] })
    }
  },
}
