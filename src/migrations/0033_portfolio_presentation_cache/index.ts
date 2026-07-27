import type { Migration } from '../types.js'

/** Reserve the cache directory for the durable, credential-free Portfolio view. */
export const migration: Migration = {
  id: '0033_portfolio_presentation_cache',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-27',
  affects: ['cache/portfolio-presentation.json'],
  summary: 'Reserve durable storage for the cached Portfolio presentation.',
  up: async () => {},
}
