import { z } from 'zod'

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const positiveDecimalString = decimalString.refine((value) => !value.startsWith('-') && value !== '0' && !/^0(?:\.0+)?$/.test(value), 'must be a positive decimal string')
const nonnegativeDecimalString = decimalString.refine((value) => !value.startsWith('-'), 'must be a non-negative decimal string')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

export const fixedIncomeLotSourceSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  observedAt: z.string().datetime({ offset: true }),
  evidenceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  externalId: z.string().trim().min(1).max(256).optional(),
}).strict()

const fixedIncomeLotBaseSchema = z.object({
  id: z.string().trim().min(1).max(256),
  positionId: z.string().trim().min(1).max(256),
  acquisitionDate: dateOnly,
  settlementDate: dateOnly.optional(),
  quantity: positiveDecimalString,
  unitCostBRL: nonnegativeDecimalString,
  totalCostBRL: nonnegativeDecimalString,
  accruedFeesBRL: nonnegativeDecimalString,
  taxLotMethod: z.enum(['explicit', 'peps', 'provider_reported', 'unknown']),
  source: fixedIncomeLotSourceSchema,
}).strict()

export const fixedIncomeLotEvidenceSchema = fixedIncomeLotBaseSchema.omit({ positionId: true }).superRefine((lot, context) => {
  if (lot.settlementDate && lot.settlementDate < lot.acquisitionDate) {
    context.addIssue({ code: 'custom', path: ['settlementDate'], message: 'settlementDate must not be before acquisitionDate' })
  }
})

export const fixedIncomeLotSchema = fixedIncomeLotBaseSchema.superRefine((lot, context) => {
  if (lot.settlementDate && lot.settlementDate < lot.acquisitionDate) {
    context.addIssue({ code: 'custom', path: ['settlementDate'], message: 'settlementDate must not be before acquisitionDate' })
  }
})

export const fixedIncomeLotBookSchema = z.object({
  version: z.literal(1),
  lots: z.array(fixedIncomeLotSchema).max(10_000),
}).strict().superRefine((book, context) => {
  const ids = new Set<string>()
  book.lots.forEach((lot, index) => {
    if (ids.has(lot.id)) {
      context.addIssue({ code: 'custom', path: ['lots', index, 'id'], message: 'duplicate lot id' })
    }
    ids.add(lot.id)
  })
})

export type FixedIncomeLot = z.infer<typeof fixedIncomeLotSchema>
export type FixedIncomeLotBook = z.infer<typeof fixedIncomeLotBookSchema>
