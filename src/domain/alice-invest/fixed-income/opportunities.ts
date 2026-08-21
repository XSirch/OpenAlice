import { createHash } from 'node:crypto'
import { z } from 'zod'

import { fixedIncomeLiquiditySchema, fixedIncomeProductSchema, fixedIncomeRateSchema } from './contracts.js'
import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const confirmationSchema = z.object({
  kind: z.enum(['btg_export', 'auvp_export', 'offer_sent_by_user', 'user_confirmation', 'public_catalog']),
  confirmedAt: z.string().datetime({ offset: true }),
}).strict()

export const fixedIncomeOpportunitySchema = z.object({
  id: z.string().trim().min(1).max(256),
  product: fixedIncomeProductSchema,
  observedAt: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }).optional(),
  minimumBRL: decimal.optional(),
  maximumAvailableBRL: decimal.optional(),
  priceBRL: decimal.optional(),
  rate: fixedIncomeRateSchema,
  liquidity: fixedIncomeLiquiditySchema,
  availability: z.enum(['indicative', 'confirmed', 'expired', 'unknown']),
  distributor: z.literal('BTG_PACTUAL'),
  origin: z.enum(['AUVP_CAPITAL', 'BTG_PACTUAL', 'USER_IMPORT']),
  confirmation: confirmationSchema,
}).strict().superRefine((offer, context) => {
  if (JSON.stringify(offer.rate) !== JSON.stringify(offer.product.rate)) {
    context.addIssue({ code: 'custom', path: ['rate'], message: 'offer rate must match the product rate' })
  }
  if (JSON.stringify(offer.liquidity) !== JSON.stringify(offer.product.liquidity)) {
    context.addIssue({ code: 'custom', path: ['liquidity'], message: 'offer liquidity must match the product liquidity' })
  }
  if (offer.availability === 'confirmed') {
    if (offer.confirmation.kind === 'public_catalog') {
      context.addIssue({ code: 'custom', path: ['confirmation', 'kind'], message: 'a public catalog cannot confirm availability' })
    }
    if (!offer.validUntil) context.addIssue({ code: 'custom', path: ['validUntil'], message: 'confirmed availability requires validUntil' })
    else {
      const windowMs = Date.parse(offer.validUntil) - Date.parse(offer.confirmation.confirmedAt)
      if (windowMs <= 0 || windowMs > 2 * 60 * 60 * 1_000) {
        context.addIssue({ code: 'custom', path: ['validUntil'], message: 'confirmed availability must expire within two hours' })
      }
    }
  }
})

const manualOfferDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  offers: z.array(fixedIncomeOpportunitySchema).min(1).max(5_000),
}).strict()

export type FixedIncomeOpportunity = z.output<typeof fixedIncomeOpportunitySchema>

export interface ManualOfferImportMetadata {
  fileName: string
  importedAt: string
  termsReviewedAt: string
}

export interface ManualOfferImportResult {
  offers: FixedIncomeOpportunity[]
  provenance: FixedIncomeSourceProvenance
}

export function importManualFixedIncomeOffers(bytes: Uint8Array, metadata: ManualOfferImportMetadata): ManualOfferImportResult {
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error('manual offer artifact must be between 1 byte and 5 MiB')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error('manual offer artifact must be valid UTF-8') }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('manual offer artifact must contain valid JSON') }
  const document = manualOfferDocumentSchema.parse(raw)
  const importedAt = z.string().datetime({ offset: true }).parse(metadata.importedAt)
  const termsReviewedAt = z.string().date().parse(metadata.termsReviewedAt)
  const fileName = z.string().trim().min(1).max(256).parse(metadata.fileName)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  for (const offer of document.offers) {
    if (Date.parse(offer.observedAt) > Date.parse(importedAt) || Date.parse(offer.confirmation.confirmedAt) > Date.parse(importedAt)) throw new Error('offer observation and confirmation cannot be after importedAt')
  }
  const offers = document.offers.map((offer) => (
    offer.availability === 'confirmed' && Date.parse(offer.validUntil!) < Date.parse(importedAt) ? { ...offer, availability: 'expired' as const } : offer
  ))
  const dataAsOf = offers.map((offer) => offer.observedAt).sort().at(-1)!
  return {
    offers,
    provenance: fixedIncomeSourceProvenanceSchema.parse({
      publisher: 'User supplied BTG/AUVP offer artifact', sourceId: `manual-offers:${checksum.slice(0, 16)}`,
      sourceUrl: `https://openalice.local/manual-import/${encodeURIComponent(fileName)}`,
      decision: 'manual', access: 'user_supplied', method: 'manual_upload', parameters: { fileName },
      license: 'user_supplied', termsReviewedAt, termsVersion: 'user-supplied-private-evidence@1',
      retrievedAt: importedAt, dataAsOf, rawPayloadChecksum: checksum, parserVersion: 'manual-fixed-income-offers@1',
      originalIdentifiers: { fileName },
    }),
  }
}
