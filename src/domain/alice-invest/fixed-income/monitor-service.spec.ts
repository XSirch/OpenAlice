import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { defaultFixedIncomeAdvisorPolicy } from './policy.js'
import { FixedIncomeMonitorService } from './monitor-service.js'
import { FixedIncomeOperationsStore } from './operations.js'

const alert = {
  id: 'recommendation-1', createdAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-21T12:00:00.000Z',
  dedupeKey: 'redacted-position:redacted-offer:2031-08-20:premises-v1', severity: 'opportunity' as const,
  title: 'Troca com ganho material', summary: 'Comparação determinística disponível para revisão humana.',
  decision: 'sell_and_reinvest' as const, netDeltaBRL: '24638.87', confidenceScore: '90', dataQualityScore: '95',
  critical: false, sourceLabels: ['Tesouro Transparente', 'Oferta privada confirmada'], readiness: 'research_only' as const, actionable: false as const,
}

function policy(notificationsEnabled: boolean) {
  const value = defaultFixedIncomeAdvisorPolicy()
  return { ...value, killSwitches: { ...value.killSwitches, opportunityScanEnabled: true, notificationsEnabled } }
}

describe('fixed-income monitor service', () => {
  it('appends one bounded Inbox digest and suppresses the replay durably', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-fi-monitor-'))
    const operations = new FixedIncomeOperationsStore(join(root, 'operations.json'), { now: () => new Date('2026-08-20T12:05:00.000Z') })
    const inbox = { append: vi.fn(async (_input: { workspaceId: string; comments?: string }) => ({ id: 'inbox-1' })) }
    const service = new FixedIncomeMonitorService({
      input: { read: vi.fn(async () => ({ version: 1 as const, workspaceId: 'alice-invest', alerts: [alert] })) }, operations, inbox: inbox as never,
      readPolicy: async () => policy(true), now: () => new Date('2026-08-20T12:05:00.000Z'),
    })
    await expect(service.tick()).resolves.toEqual({ candidates: 1, planned: 1, delivered: 1, skipped: false })
    await expect(service.tick()).resolves.toEqual({ candidates: 1, planned: 0, delivered: 0, skipped: false })
    expect(inbox.append).toHaveBeenCalledOnce()
    expect(inbox.append.mock.calls[0]?.[0]).toMatchObject({ workspaceId: 'alice-invest', comments: expect.stringContaining('Nenhuma ordem') })
    expect((await operations.read()).deliveries).toHaveLength(1)
  })

  it('evaluates but does not deliver while notifications are disabled', async () => {
    const inbox = { append: vi.fn() }
    const operations = { read: vi.fn(async () => ({ deliveries: [] })), recordDelivery: vi.fn(), appendAudit: vi.fn(async () => true) }
    const service = new FixedIncomeMonitorService({ input: { read: vi.fn(async () => ({ version: 1 as const, workspaceId: 'alice-invest', alerts: [alert] })) }, operations: operations as never, inbox: inbox as never, readPolicy: async () => policy(false), now: () => new Date('2026-08-20T12:05:00.000Z') })
    await expect(service.tick()).resolves.toEqual({ candidates: 1, planned: 1, delivered: 0, skipped: true, reason: 'notifications_disabled' })
    expect(inbox.append).not.toHaveBeenCalled()
    expect(operations.recordDelivery).not.toHaveBeenCalled()
  })

  it('opens its circuit after repeated malformed input and stops reading', async () => {
    const input = { read: vi.fn(async () => { throw new Error('malformed monitor input') }) }
    const operations = { read: vi.fn(), recordDelivery: vi.fn(), appendAudit: vi.fn(async () => true) }
    const service = new FixedIncomeMonitorService({ input, operations: operations as never, inbox: { append: vi.fn() } as never, readPolicy: async () => policy(true), now: () => new Date('2026-08-20T12:05:00.000Z') })
    await expect(service.tick()).rejects.toThrow('malformed monitor input')
    await expect(service.tick()).rejects.toThrow('malformed monitor input')
    await expect(service.tick()).rejects.toThrow('malformed monitor input')
    await expect(service.tick()).resolves.toMatchObject({ skipped: true, reason: 'circuit_open' })
    expect(input.read).toHaveBeenCalledTimes(3)
    expect(service.health()).toMatchObject({ state: 'open', allowed: false })
  })
})
