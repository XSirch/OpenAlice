import type { Migration } from '../types.js'

/** Seed the sealed OpenRouter Management Key configuration without adding a key. */
export const migration: Migration = {
  id: '0032_openrouter_analytics_config',
  appVersion: '0.84.0-beta',
  introducedAt: '2026-07-27',
  affects: ['openrouter-analytics.json'],
  summary: 'Seed the private OpenRouter Analytics configuration.',
  up: async (ctx) => {
    if (await ctx.readJson('openrouter-analytics.json') === undefined) await ctx.writeJson('openrouter-analytics.json', { version: 1 })
  },
}
