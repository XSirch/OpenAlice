import type { Migration } from '../types.js'

const DEFAULT_JOURNAL = { version: 1, entries: [] }

/** Seed the versioned inbound journal without replacing any durable messages. */
export const migration: Migration = {
  id: '0025_connector_inbound_journal',
  appVersion: '0.81.0-beta',
  introducedAt: '2026-07-16',
  affects: ['connector-inbound-journal.json'],
  summary: 'Seed the private Connector inbound journal used for durable deduplication.',
  up: async (ctx) => {
    const existing = await ctx.readJson('connector-inbound-journal.json')
    if (existing !== undefined) return
    await ctx.writeJson('connector-inbound-journal.json', DEFAULT_JOURNAL)
  },
}
