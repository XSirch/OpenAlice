import type { Migration } from '../types.js'

export const migration: Migration = {
  id: '0037_brazil_market_board_cache',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-27',
  affects: ['cache/brazil-market-board.json'],
  summary: 'Reserve durable cache storage for the Brazil market board.',
  async up() {},
}
