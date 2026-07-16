import { z } from 'zod'

export const marketDataCapabilitySchema = z.enum(['realtime', 'delayed', 'eod', 'unknown'])
export type MarketDataCapability = z.infer<typeof marketDataCapabilitySchema>

export const normalizedMarketObservationSchema = z.object({
  source: z.string().trim().min(1).max(128),
  symbol: z.string().trim().min(1).max(64),
  sourceTimestamp: z.string().datetime({ offset: true }),
  receivedAt: z.string().datetime({ offset: true }),
  capability: marketDataCapabilitySchema.default('unknown'),
  bid: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  ask: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  spread: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  volume: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
}).strict()
export type NormalizedMarketObservation = z.infer<typeof normalizedMarketObservationSchema>

export interface FreshnessAssessment {
  ageSeconds: number
  fresh: boolean
  capability: MarketDataCapability
}

/** Capability is observed evidence, never inferred from a vendor/source name. */
export function assessObservationFreshness(
  observation: NormalizedMarketObservation,
  maxAgeSeconds: number,
  now = new Date(observation.receivedAt),
): FreshnessAssessment {
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) throw new Error('maxAgeSeconds must be non-negative')
  const sourceTime = Date.parse(observation.sourceTimestamp)
  const currentTime = now.getTime()
  const ageSeconds = Math.max(0, (currentTime - sourceTime) / 1_000)
  return { ageSeconds, fresh: observation.capability === 'realtime' && ageSeconds <= maxAgeSeconds, capability: observation.capability }
}
