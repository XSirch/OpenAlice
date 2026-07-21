import type { Migration } from '../types.js'

const DEFAULT_JOURNAL = { version: 1, entries: [] }
export const migration: Migration = {
  id: '0027_alice_invest_readiness_evidence', appVersion: '0.81.0-beta', introducedAt: '2026-07-17',
  affects: ['alice-invest-readiness-evidence.json'],
  summary: 'Seed the append-only Alice Invest readiness evidence journal.',
  async up(ctx) { if (await ctx.readJson('alice-invest-readiness-evidence.json') === undefined) await ctx.writeJson('alice-invest-readiness-evidence.json', DEFAULT_JOURNAL) },
}
