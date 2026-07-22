import type { Migration } from '../types.js'

export const migration: Migration = {
  id: '0031_open_finance_config',
  appVersion: '0.81.0-beta',
  introducedAt: '2026-07-22',
  affects: ['open-finance.json'],
  summary: 'Seed the Open Finance custody configuration in a disabled state.',
  rationale: 'Open Finance data access is opt-in and must start disabled until the user configures a read-only provider.',
  async up(ctx) {
    if (await ctx.readJson('open-finance.json') === undefined) {
      await ctx.writeJson('open-finance.json', { version: 1, pluggy: { enabled: false } })
    }
  },
}
