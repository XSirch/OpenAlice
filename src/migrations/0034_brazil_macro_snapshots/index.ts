import type { Migration } from '../types.js'

/** Reserve durable, credential-free history for official Brazil macro data. */
export const migration: Migration = {
  id: '0034_brazil_macro_snapshots',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-27',
  affects: ['cache/brazil-macro-snapshots.json'],
  summary: 'Reserve durable provenance-aware Brazil macro snapshot history.',
  up: async () => {},
}
