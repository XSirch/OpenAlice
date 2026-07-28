import type { Migration } from '../types.js'

export const migration: Migration = {
  id: '0039_corporate_events_cache',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-28',
  affects: ['cache/corporate-events.json'],
  summary: 'Reserve durable source-attributed Brazilian corporate-event cache.',
  // Cache files live under data/cache, outside the config-only migration
  // context. The atomic cache writer creates it lazily on its first refresh.
  async up() {},
}
