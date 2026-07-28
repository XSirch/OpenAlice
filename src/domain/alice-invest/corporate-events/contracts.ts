import { createHash } from 'node:crypto'
import { z } from 'zod'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')

export const corporateEventTypeSchema = z.enum([
  'dividend', 'jcp', 'amortization', 'split', 'reverse_split', 'subscription', 'material_fact',
])
export const corporateEventStatusSchema = z.enum(['announced', 'confirmed', 'revised', 'paid'])

/** The source is part of the record, never an inferred display label. */
export const corporateEventSourceSchema = z.object({
  id: z.enum(['brapi', 'cvm', 'b3_licensed']),
  url: z.string().url(),
  license: z.enum(['provider_terms', 'official_public', 'licensed']),
  retrievedAt: timestamp,
  publishedAt: dateOnly.optional(),
}).strict()

export const corporateEventSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  issuer: z.string().trim().min(1).max(64),
  instrument: z.string().trim().toUpperCase().regex(/^[A-Z0-9.]{2,24}$/),
  type: corporateEventTypeSchema,
  /** Calendar competence establishes the identity of a corporate event. */
  competence: dateOnly,
  revision: z.string().trim().min(1).max(64),
  status: corporateEventStatusSchema,
  dateCom: dateOnly.optional(),
  exDate: dateOnly.optional(),
  paymentDate: dateOnly.optional(),
  cashAmountPerUnitBRL: decimal.optional(),
  ratioNumerator: decimal.optional(),
  ratioDenominator: decimal.optional(),
  title: z.string().trim().min(1).max(512),
  source: corporateEventSourceSchema,
}).strict().superRefine((event, context) => {
  if (['dividend', 'jcp', 'amortization'].includes(event.type) && !event.cashAmountPerUnitBRL) {
    context.addIssue({ code: 'custom', path: ['cashAmountPerUnitBRL'], message: 'cash events require the per-unit amount' })
  }
  if (['split', 'reverse_split'].includes(event.type) && (!event.ratioNumerator || !event.ratioDenominator)) {
    context.addIssue({ code: 'custom', path: ['ratioNumerator'], message: 'split events require both ratio values' })
  }
  if (event.id !== corporateEventId(event)) context.addIssue({ code: 'custom', path: ['id'], message: 'does not match the immutable corporate-event identity' })
})

export type CorporateEvent = z.infer<typeof corporateEventSchema>
export type CorporateEventType = z.infer<typeof corporateEventTypeSchema>

export type CorporateEventDraft = Omit<CorporateEvent, 'id'>

/** Required dedupe tuple: issuer, instrument, type, competence and revision. */
export function corporateEventIdentity(event: Pick<CorporateEvent, 'issuer' | 'instrument' | 'type' | 'competence' | 'revision'>): string {
  return [event.issuer.trim().toUpperCase(), event.instrument.trim().toUpperCase(), event.type, event.competence, event.revision.trim()].join('|')
}

export function corporateEventId(event: Pick<CorporateEvent, 'issuer' | 'instrument' | 'type' | 'competence' | 'revision'>): string {
  return createHash('sha256').update(corporateEventIdentity(event)).digest('hex')
}

export function createCorporateEvent(draft: CorporateEventDraft): CorporateEvent {
  return corporateEventSchema.parse({ ...draft, id: corporateEventId(draft) })
}

/**
 * Keep exactly one copy of an identity. A later source retrieval wins, while
 * the identity's revision prevents a published correction from being erased.
 */
export function dedupeCorporateEvents(events: readonly CorporateEvent[]): CorporateEvent[] {
  const byIdentity = new Map<string, CorporateEvent>()
  for (const untrusted of events) {
    const event = corporateEventSchema.parse(untrusted)
    const identity = corporateEventIdentity(event)
    const previous = byIdentity.get(identity)
    if (!previous || event.source.retrievedAt >= previous.source.retrievedAt) byIdentity.set(identity, event)
  }
  return [...byIdentity.values()].sort((a, b) =>
    a.competence.localeCompare(b.competence) || a.instrument.localeCompare(b.instrument) || a.type.localeCompare(b.type) || a.revision.localeCompare(b.revision),
  )
}

export interface BrapiCashDividend { rate?: number; lastDatePrior?: string; paymentDate?: string }

export interface CvmIpeCorporateEventInput {
  issuerCvmCode: string
  instrument: string
  referenceDate: string
  filedAt: string | null
  category: string
  type: string
  subject: string
  revision: string
  downloadUrl: string | null
  retrievedAt: string
}

/** Convert only the fields BRAPI actually supplied; unknown dates stay absent. */
export function normalizeBrapiCashDividends(input: {
  issuer: string
  instrument: string
  events: readonly BrapiCashDividend[]
  retrievedAt: string
  sourceUrl?: string
}): CorporateEvent[] {
  const retrievedAt = timestamp.parse(input.retrievedAt)
  return input.events.flatMap((raw) => {
    const amount = raw.rate
    const dateCom = date(raw.lastDatePrior)
    const paymentDate = date(raw.paymentDate)
    const competence = dateCom ?? paymentDate
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || !competence) return []
    return [createCorporateEvent({
      issuer: input.issuer,
      instrument: input.instrument,
      type: 'dividend',
      competence,
      revision: `${dateCom ?? ''}/${paymentDate ?? ''}/${amount}`,
      status: paymentDate ? 'paid' : 'confirmed',
      ...(dateCom ? { dateCom } : {}),
      ...(paymentDate ? { paymentDate } : {}),
      cashAmountPerUnitBRL: amount.toString(),
      title: 'Provento em dinheiro informado pela BRAPI',
      source: { id: 'brapi', url: input.sourceUrl ?? 'https://brapi.dev/docs/acoes/dividendos', license: 'provider_terms', retrievedAt },
    })]
  })
}

/** IPE is an official document feed. Only explicit Fato Relevante documents
 * become material-fact events; other subjects remain documents until a source
 * identifies their concrete corporate-action semantics. */
export function normalizeCvmIpeCorporateEvent(input: CvmIpeCorporateEventInput): CorporateEvent | null {
  if (!/fato relevante/i.test(input.category)) return null
  return createCorporateEvent({
    issuer: `CVM:${input.issuerCvmCode}`,
    instrument: input.instrument,
    type: 'material_fact',
    competence: date(input.referenceDate) ?? (() => { throw new Error('CVM IPE reference date is invalid.') })(),
    revision: input.revision,
    status: 'confirmed',
    ...(date(input.filedAt ?? undefined) ? { paymentDate: date(input.filedAt ?? undefined) } : {}),
    title: `${input.type}: ${input.subject}`,
    source: {
      id: 'cvm',
      url: input.downloadUrl ?? 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/',
      license: 'official_public',
      retrievedAt: timestamp.parse(input.retrievedAt),
      ...(date(input.filedAt ?? undefined) ? { publishedAt: date(input.filedAt ?? undefined) } : {}),
    },
  })
}

function date(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}
