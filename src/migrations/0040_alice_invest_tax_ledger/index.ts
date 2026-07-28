import type { Migration } from '../types.js'
import { emptyBrokerageLedger } from '../../domain/alice-invest/tax/ledger.js'
export const migration: Migration = { id: '0040_alice_invest_tax_ledger', appVersion: '0.84.0-beta', introducedAt: '2026-07-28', affects: ['alice-invest-tax-ledger.json'], summary: 'Seed the private, auditable B3 brokerage-operation ledger.', async up(ctx) { if (await ctx.readJson('alice-invest-tax-ledger.json') === undefined) await ctx.writeJson('alice-invest-tax-ledger.json', emptyBrokerageLedger) } }
