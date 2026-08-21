import { describe, expect, it } from 'vitest'
import { importManualFixedIncomeOffers } from './opportunities.js'

const offer = {
  id: 'offer-1',
  product: {
    productType: 'lca', issuer: { legalName: 'Banco Fixture', conglomerate: 'Conglomerado Confirmado' },
    rate: { kind: 'fixed', annualRatePct: '10.5' }, issueDate: '2026-08-20', maturityDate: '2031-08-20',
    liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1 }, fgc: { status: 'eligible' },
  },
  observedAt: '2026-08-20T12:00:00.000Z', validUntil: '2026-08-20T12:30:00.000Z',
  minimumBRL: '1000', maximumAvailableBRL: '50000', rate: { kind: 'fixed', annualRatePct: '10.5' },
  liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1 }, availability: 'confirmed',
  distributor: 'BTG_PACTUAL', origin: 'AUVP_CAPITAL',
  confirmation: { kind: 'user_confirmation', confirmedAt: '2026-08-20T12:00:00.000Z' },
}

describe('manual fixed-income offer import', () => {
  it('imports a strict UTF-8 user artifact with checksum and short-lived confirmation', () => {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, offers: [offer] }), 'utf8')
    const result = importManualFixedIncomeOffers(bytes, {
      fileName: 'ofertas-redigidas.json', importedAt: '2026-08-20T12:05:00.000Z', termsReviewedAt: '2026-08-20',
    })
    expect(result.offers[0]).toMatchObject({ id: 'offer-1', availability: 'confirmed', distributor: 'BTG_PACTUAL' })
    expect(result.provenance).toMatchObject({ decision: 'manual', access: 'user_supplied', method: 'manual_upload' })
    expect(result.provenance.rawPayloadChecksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not let a public catalog or an expired confirmation become confirmed availability', () => {
    const publicOffer = { ...offer, availability: 'confirmed', confirmation: { kind: 'public_catalog', confirmedAt: '2026-08-20T12:00:00.000Z' } }
    expect(() => importManualFixedIncomeOffers(Buffer.from(JSON.stringify({ schemaVersion: 1, offers: [publicOffer] })), {
      fileName: 'catalog.json', importedAt: '2026-08-20T12:05:00.000Z', termsReviewedAt: '2026-08-20',
    })).toThrow(/public catalog/i)
    expect(() => importManualFixedIncomeOffers(Buffer.from(JSON.stringify({ schemaVersion: 1, offers: [{ ...offer, validUntil: '2026-08-20T14:01:00.000Z' }] })), {
      fileName: 'offer.json', importedAt: '2026-08-20T12:05:00.000Z', termsReviewedAt: '2026-08-20',
    })).toThrow(/two hours/i)
  })

  it('rejects invalid UTF-8 and numeric financial values', () => {
    expect(() => importManualFixedIncomeOffers(Buffer.from([0xc3, 0x28]), {
      fileName: 'bad.json', importedAt: '2026-08-20T12:05:00.000Z', termsReviewedAt: '2026-08-20',
    })).toThrow(/UTF-8/)
    const numeric = { ...offer, minimumBRL: 1000 }
    expect(() => importManualFixedIncomeOffers(Buffer.from(JSON.stringify({ schemaVersion: 1, offers: [numeric] })), {
      fileName: 'numeric.json', importedAt: '2026-08-20T12:05:00.000Z', termsReviewedAt: '2026-08-20',
    })).toThrow()
  })
})
