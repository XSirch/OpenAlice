import { createHash } from 'node:crypto'
import { z } from 'zod'

export type FixedIncomeProviderJson = string | boolean | null | FixedIncomeProviderJson[] | { [key: string]: FixedIncomeProviderJson }

const providerJsonSchema: z.ZodType<FixedIncomeProviderJson> = z.lazy(() => z.union([
  z.string(),
  z.boolean(),
  z.null(),
  z.array(providerJsonSchema),
  z.record(z.string(), providerJsonSchema),
]))

export const fixedIncomeDatasetSchema = z.enum([
  'treasury_catalog',
  'treasury_prices',
  'macro_series',
  'bank_financials',
  'private_credit_documents',
  'fgc_policy',
  'offer_inventory',
  'manual_import',
])

export const fixedIncomeProviderRequestSchema = z.object({
  dataset: fixedIncomeDatasetSchema,
  asOf: z.string().datetime({ offset: true }),
  identifiers: z.record(
    z.string().trim().min(1).max(64),
    z.string().trim().min(1).max(256),
  ).refine((value) => Object.keys(value).length <= 32, 'must contain at most 32 identifiers'),
}).strict()

export const fixedIncomeSourceProvenanceSchema = z.object({
  publisher: z.string().trim().min(1).max(160),
  sourceId: z.string().trim().min(1).max(160),
  sourceUrl: z.string().url().max(2_048),
  decision: z.enum(['automate', 'manual', 'blocked']),
  access: z.enum(['official_public_api', 'official_public_download', 'official_public_page', 'user_supplied']),
  method: z.enum(['GET', 'manual_upload']),
  parameters: z.record(
    z.string().trim().min(1).max(64),
    z.string().trim().min(1).max(512),
  ).refine((value) => Object.keys(value).length <= 64, 'must contain at most 64 parameters'),
  license: z.enum(['official_public', 'open_data', 'terms_review_required', 'user_supplied']),
  termsReviewedAt: z.string().date(),
  termsVersion: z.string().trim().min(1).max(160),
  retrievedAt: z.string().datetime({ offset: true }),
  dataAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/).optional(),
  rawPayloadChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().trim().min(1).max(64),
  originalIdentifiers: z.record(
    z.string().trim().min(1).max(64),
    z.string().trim().min(1).max(256),
  ).refine((value) => Object.keys(value).length <= 64, 'must contain at most 64 original identifiers'),
}).strict()

export const fixedIncomeSnapshotQualitySchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  criticalFieldsMissing: z.array(z.string().trim().min(1).max(160)).max(64),
}).strict()

export const fixedIncomeSnapshotInputSchema = z.object({
  dataset: fixedIncomeDatasetSchema,
  providerId: z.string().trim().min(1).max(128),
  observedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  provenance: z.array(fixedIncomeSourceProvenanceSchema).min(1).max(16),
  quality: fixedIncomeSnapshotQualitySchema,
  payload: z.record(z.string(), providerJsonSchema),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.expiresAt <= snapshot.observedAt) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'must be after observedAt' })
  }
  snapshot.provenance.forEach((source, index) => {
    if (source.decision === 'blocked') {
      context.addIssue({ code: 'custom', path: ['provenance', index, 'decision'], message: 'blocked sources cannot produce snapshots' })
    }
    if (source.retrievedAt > snapshot.observedAt) {
      context.addIssue({ code: 'custom', path: ['provenance', index, 'retrievedAt'], message: 'retrievedAt must not be after observedAt' })
    }
  })
})

export const fixedIncomeSnapshotSchema = fixedIncomeSnapshotInputSchema.extend({
  schemaVersion: z.literal(1),
  payloadChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export type FixedIncomeSnapshotInput = z.input<typeof fixedIncomeSnapshotInputSchema>
export type FixedIncomeSnapshot = z.output<typeof fixedIncomeSnapshotSchema>
export type FixedIncomeProviderRequest = z.output<typeof fixedIncomeProviderRequestSchema>
export type FixedIncomeSourceProvenance = z.output<typeof fixedIncomeSourceProvenanceSchema>

export interface FixedIncomeProvider {
  readonly id: string
  fetch(request: FixedIncomeProviderRequest): Promise<FixedIncomeSnapshot>
}

export interface FixedIncomeSnapshotAssessmentInput {
  critical: boolean
  minimumQuality: number
  minimumConfidence: number
  now?: Date
}

export interface FixedIncomeSnapshotAssessment {
  state: 'fresh' | 'stale' | 'insufficient_data'
  usableForRecommendation: boolean
  reasons: string[]
}

export function createFixedIncomeSnapshot(input: FixedIncomeSnapshotInput): FixedIncomeSnapshot {
  const parsed = fixedIncomeSnapshotInputSchema.parse(input)
  const payloadChecksum = createHash('sha256').update(canonicalJson(parsed.payload), 'utf8').digest('hex')
  return fixedIncomeSnapshotSchema.parse({ schemaVersion: 1, ...parsed, payloadChecksum })
}

export function assessFixedIncomeSnapshot(
  snapshotInput: FixedIncomeSnapshot,
  input: FixedIncomeSnapshotAssessmentInput,
): FixedIncomeSnapshotAssessment {
  const snapshot = fixedIncomeSnapshotSchema.parse(snapshotInput)
  const now = input.now ?? new Date()
  if (input.critical && now.getTime() > Date.parse(snapshot.expiresAt)) {
    return { state: 'stale', usableForRecommendation: false, reasons: ['snapshot_expired'] }
  }
  const reasons = [
    ...(snapshot.quality.score < input.minimumQuality ? ['quality_below_minimum'] : []),
    ...(snapshot.quality.confidence < input.minimumConfidence ? ['confidence_below_minimum'] : []),
    ...(snapshot.quality.criticalFieldsMissing.length > 0 ? ['critical_fields_missing'] : []),
  ]
  if (reasons.length > 0) {
    return { state: 'insufficient_data', usableForRecommendation: false, reasons }
  }
  return { state: 'fresh', usableForRecommendation: true, reasons: [] }
}

function canonicalJson(value: FixedIncomeProviderJson): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`
}
