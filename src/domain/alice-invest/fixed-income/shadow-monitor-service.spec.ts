import { describe, expect, it, vi } from 'vitest'

import { defaultFixedIncomeAdvisorPolicy } from './policy.js'
import { FixedIncomeShadowMonitorService } from './shadow-monitor-service.js'

const observation = {
  id: 'official-comparison-2026-08-20', observedAt: '2026-08-20T12:00:00.000Z', referenceId: 'official-reference-1',
  calculationTraceId: 'a'.repeat(64), expectedNetBRL: '1000', actualNetBRL: '999.99', staleDataCount: 0, providerFailureCount: 0,
  alertCount: 1, duplicateAlertCount: 0, reviewedAlertCount: 1, falsePositiveCount: 0, thresholdVariant: 'default-v1', sourceChecksum: 'b'.repeat(64),
}

describe('fixed-income shadow monitor service', () => {
  it('collects trace-linked input idempotently and audits the tick', async () => {
    const input = { read: vi.fn(async () => [observation]) }
    const validation = { append: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) }
    const operations = { appendAudit: vi.fn(async () => true) }
    const service = new FixedIncomeShadowMonitorService({ input: input as never, validation, operations, readPolicy: async () => defaultFixedIncomeAdvisorPolicy(), now: () => new Date('2026-08-20T12:00:00.000Z') })
    await expect(service.tick()).resolves.toEqual({ accepted: 1, replayed: 0, skipped: false })
    await expect(service.tick()).resolves.toEqual({ accepted: 0, replayed: 1, skipped: false })
    expect(validation.append).toHaveBeenCalledWith(observation)
    expect(operations.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'scan' }))
  })

  it('does not read or create evidence when the advisor is disabled', async () => {
    const input = { read: vi.fn(async () => [observation]) }
    const validation = { append: vi.fn() }
    const operations = { appendAudit: vi.fn() }
    const service = new FixedIncomeShadowMonitorService({ input: input as never, validation, operations, readPolicy: async () => ({ ...defaultFixedIncomeAdvisorPolicy(), enabled: false }) })
    await expect(service.tick()).resolves.toEqual({ accepted: 0, replayed: 0, skipped: true })
    expect(input.read).not.toHaveBeenCalled()
    expect(validation.append).not.toHaveBeenCalled()
  })

  it('fails closed and audits malformed input without appending evidence', async () => {
    const validation = { append: vi.fn() }
    const operations = { appendAudit: vi.fn(async () => true) }
    const service = new FixedIncomeShadowMonitorService({ input: { read: vi.fn(async () => { throw new Error('invalid input') }) } as never, validation, operations, readPolicy: async () => defaultFixedIncomeAdvisorPolicy(), now: () => new Date('2026-08-20T12:00:00.000Z') })
    await expect(service.tick()).rejects.toThrow('invalid input')
    expect(validation.append).not.toHaveBeenCalled()
    expect(operations.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'provider_failure' }))
  })
})
