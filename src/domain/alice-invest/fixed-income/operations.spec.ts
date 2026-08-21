import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { FixedIncomeCircuitBreaker, FixedIncomeOperationsStore, formatFixedIncomeTelegramDigest, planFixedIncomeAlertDelivery } from './operations.js'

const alert = (overrides: Record<string, unknown> = {}) => ({
  id: 'rec-1', createdAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-20T14:00:00.000Z',
  dedupeKey: 'position-hash:offer-hash:2031-08-20:premises-v1', severity: 'opportunity' as const,
  title: 'Troca com ganho material', summary: 'Ganho líquido estimado de R$ 24.638,87 até 20/08/2031.',
  decision: 'sell_and_reinvest' as const, netDeltaBRL: '24638.87', confidenceScore: '90', dataQualityScore: '95',
  critical: false, sourceLabels: ['Tesouro Transparente', 'Oferta privada confirmada'], readiness: 'research_only' as const, actionable: false as const,
  ...overrides,
})

describe('fixed-income operations', () => {
  it('deduplicates alerts, enforces cooldown, and allows material or critical updates', () => {
    const prior = [{ dedupeKey: alert().dedupeKey, deliveredAt: '2026-08-10T12:00:00.000Z', netDeltaBRL: '24000.00' }]
    expect(planFixedIncomeAlertDelivery([alert()], prior, { now: '2026-08-20T12:00:00.000Z', cooldownDays: 30, materialDeltaBRL: '1000' })).toEqual([])
    expect(planFixedIncomeAlertDelivery([alert({ netDeltaBRL: '26001.00' })], prior, { now: '2026-08-20T12:00:00.000Z', cooldownDays: 30, materialDeltaBRL: '1000' })).toHaveLength(1)
    expect(planFixedIncomeAlertDelivery([alert({ critical: true })], prior, { now: '2026-08-20T12:00:00.000Z', cooldownDays: 30, materialDeltaBRL: '1000' })).toHaveLength(1)
  })

  it('formats a bounded Telegram digest without external identifiers or execution language', () => {
    const text = formatFixedIncomeTelegramDigest([alert()], '2026-08-20T12:05:00.000Z')
    expect(text).toContain('RENDA FIXA — RESUMO INFORMATIVO')
    expect(text).toContain('R$ 24.638,87')
    expect(text).not.toContain('position-hash')
    expect(text).not.toContain('offer-hash')
    expect(text).toContain('Nenhuma ordem')
    expect(text.length).toBeLessThanOrEqual(3500)
  })

  it('recovers idempotent delivery/outcome/audit state and prunes it by retention', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fixed-income-operations-'))
    const path = join(directory, 'operations.json')
    const store = new FixedIncomeOperationsStore(path, { retentionDays: 30, maxEntries: 100, now: () => new Date('2026-08-20T12:00:00.000Z') })
    expect(await store.recordDelivery({ eventId: 'event-1', dedupeKey: alert().dedupeKey, deliveredAt: '2026-08-20T12:00:00.000Z', netDeltaBRL: '24638.87', channel: 'telegram' })).toBe(true)
    expect(await store.recordDelivery({ eventId: 'event-1', dedupeKey: alert().dedupeKey, deliveredAt: '2026-08-20T12:00:00.000Z', netDeltaBRL: '24638.87', channel: 'telegram' })).toBe(false)
    await store.recordManualOutcome({ recommendationId: 'rec-1', recordedAt: '2026-08-20T12:10:00.000Z', outcome: 'executed_elsewhere', note: 'Registrado após confirmação humana.' })
    await store.appendAudit({ id: 'audit-old', at: '2026-06-01T00:00:00.000Z', kind: 'provider_failure', detail: 'old' })
    await store.appendAudit({ id: 'audit-current', at: '2026-08-20T12:11:00.000Z', kind: 'delivery', detail: 'telegram delivered' })
    const recovered = await new FixedIncomeOperationsStore(path, { retentionDays: 30, maxEntries: 100, now: () => new Date('2026-08-20T12:00:00.000Z') }).read()
    expect(recovered.deliveries).toHaveLength(1)
    expect(recovered.manualOutcomes).toHaveLength(1)
    expect(recovered.audit.map((item) => item.id)).toEqual(['manual:rec-1:2026-08-20T12:10:00.000Z', 'audit-current'])
    expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)
  })

  it('opens and recovers a provider circuit breaker deterministically', () => {
    const breaker = new FixedIncomeCircuitBreaker({ failureThreshold: 3, openDurationMs: 60_000 })
    breaker.recordFailure(new Date('2026-08-20T12:00:00.000Z'))
    breaker.recordFailure(new Date('2026-08-20T12:00:01.000Z'))
    breaker.recordFailure(new Date('2026-08-20T12:00:02.000Z'))
    expect(breaker.health(new Date('2026-08-20T12:00:03.000Z'))).toMatchObject({ state: 'open', allowed: false, consecutiveFailures: 3 })
    expect(breaker.health(new Date('2026-08-20T12:01:03.000Z')).state).toBe('half_open')
    breaker.recordSuccess()
    expect(breaker.health(new Date('2026-08-20T12:01:04.000Z'))).toMatchObject({ state: 'closed', allowed: true, consecutiveFailures: 0 })
  })
})
