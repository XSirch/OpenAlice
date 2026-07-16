import Decimal from 'decimal.js'
import { z } from 'zod'
import type { MarketDataCapability } from './observation.js'

export const marketUniverseSchema = z.object({ b3: z.array(z.string().trim().min(1).max(24)).min(1).max(50), crypto: z.array(z.string().trim().min(1).max(32)).min(1).max(50) }).strict()
export type MarketUniverse = z.infer<typeof marketUniverseSchema>
export interface MarketGateInput { scansEnabled: boolean; marketOpen: boolean; capability: MarketDataCapability; liquidityBRL: string; minimumLiquidityBRL: string }
export interface MarketGateResult { allowed: boolean; reasons: string[] }
/** Pure gate: calendar/session resolution stays with the caller, and no asset enumeration occurs here. */
export function evaluateMarketGate(input: MarketGateInput): MarketGateResult {
  const reasons: string[] = []
  if (!input.scansEnabled) reasons.push('market scans are disabled')
  if (!input.marketOpen) reasons.push('market is closed')
  if (input.capability !== 'realtime') reasons.push('source is not realtime')
  if (new Decimal(input.liquidityBRL).lt(input.minimumLiquidityBRL)) reasons.push('liquidity is below minimum')
  return { allowed: reasons.length === 0, reasons }
}
