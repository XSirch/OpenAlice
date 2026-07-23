import { secTypeToClass } from '../lib/asset-class'

export type ModelBucket = 'fixed-income' | 'equities' | 'funds-etfs' | 'crypto' | 'cash' | 'unclassified'

export interface ModelAllocation {
  bucket: ModelBucket
  label: string
  targetPercent: number
}

export interface ValuedPosition {
  secType?: string
  valueBRL: number
}

export const BALANCED_MODEL: readonly ModelAllocation[] = [
  { bucket: 'fixed-income', label: 'Renda fixa', targetPercent: 45 },
  { bucket: 'equities', label: 'Ações', targetPercent: 25 },
  { bucket: 'funds-etfs', label: 'Fundos e ETFs', targetPercent: 20 },
  { bucket: 'crypto', label: 'Criptoativos', targetPercent: 5 },
  { bucket: 'cash', label: 'Caixa', targetPercent: 5 },
]

export interface AllocationComparison extends ModelAllocation {
  currentValueBRL: number
  currentPercent: number
  targetValueBRL: number
  differenceBRL: number
}

export function bucketForSecType(secType?: string): ModelBucket {
  const assetClass = secTypeToClass(secType)
  if (assetClass === 'bond') return 'fixed-income'
  if (assetClass === 'equity') return 'equities'
  if (assetClass === 'etf' || secType?.toUpperCase() === 'FUND') return 'funds-etfs'
  if (assetClass === 'crypto') return 'crypto'
  if (assetClass === 'forex' || secType?.toUpperCase() === 'CASH') return 'cash'
  return 'unclassified'
}

export function compareToBalancedModel(positions: readonly ValuedPosition[]): { totalBRL: number; unclassifiedBRL: number; rows: AllocationComparison[] } {
  const totals = new Map<ModelBucket, number>()
  for (const position of positions) {
    if (!Number.isFinite(position.valueBRL) || position.valueBRL <= 0) continue
    const bucket = bucketForSecType(position.secType)
    totals.set(bucket, (totals.get(bucket) ?? 0) + position.valueBRL)
  }
  const totalBRL = [...totals.values()].reduce((sum, value) => sum + value, 0)
  const unclassifiedBRL = totals.get('unclassified') ?? 0
  const rows = BALANCED_MODEL.map((model) => {
    const currentValueBRL = totals.get(model.bucket) ?? 0
    const targetValueBRL = totalBRL * (model.targetPercent / 100)
    return {
      ...model,
      currentValueBRL,
      currentPercent: totalBRL > 0 ? currentValueBRL / totalBRL * 100 : 0,
      targetValueBRL,
      differenceBRL: targetValueBRL - currentValueBRL,
    }
  })
  return { totalBRL, unclassifiedBRL, rows }
}
