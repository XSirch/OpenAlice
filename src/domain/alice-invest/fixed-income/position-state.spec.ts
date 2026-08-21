import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { FixedIncomePositionStateStore } from './position-state.js'

describe('fixed-income position state', () => {
  it('persists evidence atomically and keeps calculation traces idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-fi-position-')); const path = join(root, 'positions.json')
    const store = new FixedIncomePositionStateStore(path, () => new Date('2026-08-20T12:00:00.000Z'))
    const lot = { id: 'lot-1', positionId: 'position-1', acquisitionDate: '2024-08-20', quantity: '10', unitCostBRL: '1000', totalCostBRL: '10000', accruedFeesBRL: '0', taxLotMethod: 'explicit' as const, source: { provider: 'user', observedAt: '2026-08-20T12:00:00.000Z', evidenceChecksum: 'a'.repeat(64) } }
    const record = await store.replaceEvidence('position-1', { lots: [lot], cashFlows: [], risk: null, documents: [] })
    expect(record.lots).toHaveLength(1)
    const calculation = { calculationTraceId: 'b'.repeat(64), calculatedAt: '2026-08-20T12:00:00.000Z', targetDate: '2031-08-20', decision: 'sell_and_reinvest' as const, holdNetBRL: '180000', reinvestNetBRL: '200000', netDeltaBRL: '20000', annualizedUpliftPct: '2', breakEvenAnnualNetRatePct: '8', methodologyIds: ['switch@1'] }
    expect(await store.recordCalculation('position-1', calculation)).toBe(true)
    expect(await store.recordCalculation('position-1', calculation)).toBe(false)
    expect((await new FixedIncomePositionStateStore(path).get('position-1')).calculations).toEqual([calculation])
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, records: [{ positionId: 'position-1' }] })
  })

  it('rejects evidence associated with another raw position', async () => {
    const store = new FixedIncomePositionStateStore(join(await mkdtemp(join(tmpdir(), 'openalice-fi-position-')), 'positions.json'))
    const lot = { id: 'lot-1', positionId: 'other-position', acquisitionDate: '2024-08-20', quantity: '10', unitCostBRL: '1000', totalCostBRL: '10000', accruedFeesBRL: '0', taxLotMethod: 'explicit' as const, source: { provider: 'user', observedAt: '2026-08-20T12:00:00.000Z', evidenceChecksum: 'a'.repeat(64) } }
    await expect(store.replaceEvidence('position-1', { lots: [lot], cashFlows: [], risk: null, documents: [] })).rejects.toThrow('must match record positionId')
  })
})
