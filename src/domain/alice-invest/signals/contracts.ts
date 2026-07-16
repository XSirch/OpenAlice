import { z } from 'zod'
import { marketDataCapabilitySchema } from '../market-data/observation.js'

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const iso = z.string().datetime({ offset: true })
export const signalObservationSchema = z.object({ symbol:z.string().min(1).max(64), source:z.string().min(1).max(128), sourceTimestamp:iso, receivedAt:iso, capability:marketDataCapabilitySchema, close:decimal, volume:decimal.optional() }).strict()
export const signalCandidateSchema = z.object({ strategyId:z.string().min(1).max(80), strategyVersion:z.string().min(1).max(40), symbol:z.string().min(1).max(64), observations:z.array(signalObservationSchema).min(1).max(200), targetPrice:decimal, stopPrice:decimal, validUntil:iso, riskNotes:z.array(z.string().min(1).max(400)).max(16), status:z.enum(['eligible','rejected','stale']) }).strict()
export const informationalSignalSchema = z.object({ id:z.string().uuid(), candidate:signalCandidateSchema, side:z.literal('BUY'), status:z.enum(['informational','invalidated','expired']), createdAt:iso, rationale:z.array(z.string().min(1).max(500)).min(1).max(12) }).strict()
export type SignalObservation=z.infer<typeof signalObservationSchema>
export type SignalCandidate=z.infer<typeof signalCandidateSchema>
export type InformationalSignal=z.infer<typeof informationalSignalSchema>
