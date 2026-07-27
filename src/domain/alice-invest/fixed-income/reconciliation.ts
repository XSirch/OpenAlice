import Decimal from 'decimal.js'
import type { CustodyPosition, CustodySnapshot } from '../../open-finance/pluggy.js'
import { normalizeFixedIncomePosition, type FixedIncomeCustodyDefinitions, type FixedIncomePosition } from './contracts.js'

export interface FixedIncomeCustodyReconciliation {
  positions: FixedIncomePosition[]
  unresolved: Array<{ positionId: string; reason: string }>
  unclassifiedPositionIds: string[]
}

/**
 * Reconcile only explicitly classified Pluggy holdings. Names, product types
 * and issuer strings from the provider are not enough to infer FGC coverage
 * or a banking conglomerate, so unmatched custody remains visible as such.
 */
export function reconcilePluggyFixedIncomeCustody(snapshot: CustodySnapshot, definitions: FixedIncomeCustodyDefinitions): FixedIncomeCustodyReconciliation {
  const custodyById = new Map(snapshot.positions.map((position) => [position.id, position]))
  const classifiedIds = new Set(definitions.entries.map((entry) => entry.source.positionId))
  const positions: FixedIncomePosition[] = []
  const unresolved: Array<{ positionId: string; reason: string }> = []

  for (const definition of definitions.entries) {
    const custody = custodyById.get(definition.source.positionId)
    if (!custody) {
      unresolved.push({ positionId: definition.source.positionId, reason: 'The classified custody position was not present in the latest snapshot.' })
      continue
    }
    const investedAmountBRL = decimal(custody.originalAmount)
    const currentAmountBRL = decimal(custody.value)
    const custodyAsOf = dateOnly(custody.asOf ?? snapshot.fetchedAt)
    if (!investedAmountBRL) {
      unresolved.push({ positionId: custody.id, reason: 'The custody provider did not report a reliable invested amount.' })
      continue
    }
    if (!currentAmountBRL) {
      unresolved.push({ positionId: custody.id, reason: 'The custody provider did not report a current amount.' })
      continue
    }
    if (!custodyAsOf) {
      unresolved.push({ positionId: custody.id, reason: 'The custody provider did not report a valid data-base.' })
      continue
    }
    positions.push(normalizeFixedIncomePosition({
      id: `pluggy:${custody.id}`,
      product: definition.product,
      investedAmountBRL,
      currentAmountBRL,
      ...(dateOnly(custody.acquiredAt ?? '') ? { acquiredDate: dateOnly(custody.acquiredAt ?? '') } : {}),
      custodyAsOf,
      source: definition.source,
    }))
  }

  return {
    positions,
    unresolved,
    unclassifiedPositionIds: snapshot.positions.filter((position) => !classifiedIds.has(position.id)).map((position) => position.id),
  }
}

function decimal(value: number | undefined): string | undefined {
  if (value == null || !Number.isFinite(value) || value < 0) return undefined
  return new Decimal(value).toFixed()
}

function dateOnly(value: string): string | undefined {
  const candidate = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined
}
