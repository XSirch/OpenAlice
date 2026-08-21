import { describe, expect, it } from 'vitest'

import {
  assessFixedIncomeSnapshot,
  createFixedIncomeSnapshot,
  fixedIncomeProviderRequestSchema,
  type FixedIncomeSnapshotInput,
} from './provider-contract.js'

describe('fixed-income provider snapshot contract', () => {
  it('creates a reproducible snapshot with required official provenance', () => {
    const snapshot = createFixedIncomeSnapshot({
      dataset: 'treasury_prices',
      providerId: 'tesouro-transparente',
      observedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-21T12:00:00.000Z',
      provenance: [{
        publisher: 'Tesouro Nacional',
        sourceId: 'tesouro-transparente-precos-taxas',
        sourceUrl: 'https://www.tesourotransparente.gov.br/',
        decision: 'automate',
        access: 'official_public_download',
        method: 'GET',
        parameters: { format: 'csv' },
        license: 'official_public',
        termsReviewedAt: '2026-08-20',
        termsVersion: 'access-page-2026-08-20',
        retrievedAt: '2026-08-20T12:00:00.000Z',
        dataAsOf: '2026-08-20',
        rawPayloadChecksum: 'a'.repeat(64),
        parserVersion: 'tesouro-prices@1',
        originalIdentifiers: { securityCode: 'LFT' },
      }],
      quality: { score: 100, confidence: 95, criticalFieldsMissing: [] },
      payload: { symbol: 'LFT', rate: '10.50' },
    })

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      dataset: 'treasury_prices',
      providerId: 'tesouro-transparente',
      payloadChecksum: '9836fd38ed8d63db2d14926ec47f98fb0b2269d4d1ae8ea681e2b0035c73d64d',
    })
  })

  it('fails closed when a critical snapshot is stale', () => {
    const snapshot = createFixedIncomeSnapshot({
      dataset: 'treasury_prices',
      providerId: 'tesouro-transparente',
      observedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-20T13:00:00.000Z',
      provenance: [{
        publisher: 'Tesouro Nacional',
        sourceId: 'tesouro-transparente-precos-taxas',
        sourceUrl: 'https://www.tesourotransparente.gov.br/',
        decision: 'automate',
        access: 'official_public_download',
        method: 'GET',
        parameters: { format: 'csv' },
        license: 'official_public',
        termsReviewedAt: '2026-08-20',
        termsVersion: 'access-page-2026-08-20',
        retrievedAt: '2026-08-20T12:00:00.000Z',
        dataAsOf: '2026-08-20',
        rawPayloadChecksum: 'a'.repeat(64),
        parserVersion: 'tesouro-prices@1',
        originalIdentifiers: { securityCode: 'LFT' },
      }],
      quality: { score: 100, confidence: 95, criticalFieldsMissing: [] },
      payload: { symbol: 'LFT', rate: '10.50' },
    })

    expect(assessFixedIncomeSnapshot(snapshot, {
      critical: true,
      minimumQuality: 85,
      minimumConfidence: 80,
      now: new Date('2026-08-20T13:00:00.001Z'),
    })).toEqual({
      state: 'stale',
      usableForRecommendation: false,
      reasons: ['snapshot_expired'],
    })
  })

  it('fails closed when quality, confidence, or critical fields are insufficient', () => {
    const snapshot = createFixedIncomeSnapshot({
      dataset: 'offer_inventory',
      providerId: 'manual-btg-auvp',
      observedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-20T13:00:00.000Z',
      provenance: [{
        publisher: 'User supplied BTG/AUVP export',
        sourceId: 'redacted-export-sha256',
        sourceUrl: 'https://openalice.local/manual-import',
        decision: 'manual',
        access: 'user_supplied',
        method: 'manual_upload',
        parameters: { importFormat: 'csv' },
        license: 'user_supplied',
        termsReviewedAt: '2026-08-20',
        termsVersion: 'user-attestation-v1',
        retrievedAt: '2026-08-20T12:00:00.000Z',
        dataAsOf: '2026-08-20T12:00:00.000Z',
        rawPayloadChecksum: 'b'.repeat(64),
        parserVersion: 'manual-offers@1',
        originalIdentifiers: { sourceRow: '42' },
      }],
      quality: { score: 70, confidence: 60, criticalFieldsMissing: ['availabilityConfirmedAt'] },
      payload: { product: 'LCA' },
    })

    expect(assessFixedIncomeSnapshot(snapshot, {
      critical: true,
      minimumQuality: 85,
      minimumConfidence: 80,
      now: new Date('2026-08-20T12:30:00.000Z'),
    })).toEqual({
      state: 'insufficient_data',
      usableForRecommendation: false,
      reasons: ['quality_below_minimum', 'confidence_below_minimum', 'critical_fields_missing'],
    })
  })

  it('accepts only read requests and rejects execution-shaped fields', () => {
    expect(fixedIncomeProviderRequestSchema.parse({
      dataset: 'treasury_prices',
      asOf: '2026-08-20T12:00:00.000Z',
      identifiers: { securityCode: 'LFT' },
    })).toMatchObject({ dataset: 'treasury_prices', identifiers: { securityCode: 'LFT' } })

    expect(() => fixedIncomeProviderRequestSchema.parse({
      dataset: 'offer_inventory',
      asOf: '2026-08-20T12:00:00.000Z',
      identifiers: { product: 'LCA' },
      action: 'buy',
    })).toThrow()
  })

  it('rejects provenance timestamps that are newer than the snapshot', () => {
    expect(() => createFixedIncomeSnapshot({
      dataset: 'macro_series',
      providerId: 'bcb-sgs',
      observedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-21T12:00:00.000Z',
      provenance: [{
        publisher: 'Banco Central do Brasil',
        sourceId: 'sgs-1178',
        sourceUrl: 'https://api.bcb.gov.br/',
        decision: 'automate',
        access: 'official_public_api',
        method: 'GET',
        parameters: { series: '1178' },
        license: 'open_data',
        termsReviewedAt: '2026-08-20',
        termsVersion: 'dados-abertos-2026-08-20',
        retrievedAt: '2026-08-20T12:00:01.000Z',
        dataAsOf: '2026-08-20',
        rawPayloadChecksum: 'c'.repeat(64),
        parserVersion: 'bcb-sgs@1',
        originalIdentifiers: { series: '1178' },
      }],
      quality: { score: 100, confidence: 100, criticalFieldsMissing: [] },
      payload: { series: '1178', value: '14.90' },
    })).toThrow(/retrievedAt/)
  })

  it('rejects snapshots that omit reproducibility and terms-review evidence', () => {
    const malformedSnapshot = {
      dataset: 'treasury_catalog',
      providerId: 'tesouro-transparente',
      observedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-21T12:00:00.000Z',
      provenance: [{
        publisher: 'Tesouro Nacional',
        sourceId: 'tesouro_transparente.td_price_rate.v1',
        sourceUrl: 'https://www.tesourotransparente.gov.br/',
        access: 'official_public_download',
        license: 'open_data',
        retrievedAt: '2026-08-20T12:00:00.000Z',
        dataAsOf: '2026-08-20',
      }],
      quality: { score: 100, confidence: 100, criticalFieldsMissing: [] },
      payload: { title: 'Tesouro Selic' },
    }

    expect(() => createFixedIncomeSnapshot(malformedSnapshot as unknown as FixedIncomeSnapshotInput)).toThrow()
  })

  it('rejects sources whose automation decision is blocked', () => {
    expect(() => createFixedIncomeSnapshot({
      dataset: 'offer_inventory',
      providerId: 'unlicensed-feed',
      observedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-20T13:00:00.000Z',
      provenance: [{
        publisher: 'Restricted provider',
        sourceId: 'restricted-feed',
        sourceUrl: 'https://example.com/restricted-feed',
        decision: 'blocked',
        access: 'official_public_page',
        method: 'GET',
        parameters: {},
        license: 'terms_review_required',
        termsReviewedAt: '2026-08-20',
        termsVersion: 'not-authorized-for-automation',
        retrievedAt: '2026-08-20T12:00:00.000Z',
        dataAsOf: '2026-08-20T12:00:00.000Z',
        rawPayloadChecksum: 'd'.repeat(64),
        parserVersion: 'restricted@1',
        originalIdentifiers: {},
      }],
      quality: { score: 100, confidence: 100, criticalFieldsMissing: [] },
      payload: { product: 'CDB' },
    })).toThrow(/blocked/)
  })
})
