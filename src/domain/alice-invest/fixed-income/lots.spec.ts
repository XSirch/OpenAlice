import { describe, expect, it } from 'vitest'

import { fixedIncomeLotBookSchema, fixedIncomeLotSchema } from './lots.js'

const source = {
  provider: 'pluggy',
  observedAt: '2026-08-20T12:00:00.000Z',
  evidenceChecksum: 'a'.repeat(64),
  externalId: 'investment-redacted-001',
}

describe('fixed-income lots', () => {
  it('preserves acquisition, settlement, quantity, cost, fees, method, and evidence', () => {
    expect(fixedIncomeLotSchema.parse({
      id: 'lot-1',
      positionId: 'position-1',
      acquisitionDate: '2026-01-05',
      settlementDate: '2026-01-06',
      quantity: '10.25',
      unitCostBRL: '1000.00',
      totalCostBRL: '10250.00',
      accruedFeesBRL: '2.50',
      taxLotMethod: 'provider_reported',
      source,
    })).toMatchObject({ quantity: '10.25', totalCostBRL: '10250.00', source })
  })

  it('rejects impossible dates, negative money, and duplicate lot identities', () => {
    expect(() => fixedIncomeLotSchema.parse({
      id: 'lot-1', positionId: 'position-1', acquisitionDate: '2026-01-05', settlementDate: '2026-01-04',
      quantity: '1', unitCostBRL: '1000', totalCostBRL: '1000', accruedFeesBRL: '0', taxLotMethod: 'explicit', source,
    })).toThrow(/settlementDate/)
    expect(() => fixedIncomeLotSchema.parse({
      id: 'lot-1', positionId: 'position-1', acquisitionDate: '2026-01-05',
      quantity: '1', unitCostBRL: '1000', totalCostBRL: '1000', accruedFeesBRL: '-1', taxLotMethod: 'explicit', source,
    })).toThrow()
    const valid = {
      id: 'lot-1', positionId: 'position-1', acquisitionDate: '2026-01-05',
      quantity: '1', unitCostBRL: '1000', totalCostBRL: '1000', accruedFeesBRL: '0', taxLotMethod: 'explicit', source,
    }
    expect(() => fixedIncomeLotBookSchema.parse({ version: 1, lots: [valid, valid] })).toThrow(/duplicate/)
  })
})
