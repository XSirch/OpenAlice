import type { Migration } from '../types.js'

export const migration: Migration = {
  id: '0036_fgc_coverage_policy',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-27',
  affects: ['fgc-coverage-policy.json'],
  summary: 'Seed dated, user-configurable FGC coverage policy defaults.',
  async up(ctx) {
    if (await ctx.readJson('fgc-coverage-policy.json') === undefined) {
      await ctx.writeJson('fgc-coverage-policy.json', { version: 1, perConglomerateLimitBRL: '250000', aggregateFourYearLimitBRL: '1000000', paidWithinCurrentFourYearWindowBRL: '0', effectiveFrom: '2017-12-22', referenceUrl: 'https://www.fgc.org.br/sobre-garantia-fgc' })
    }
  },
}
