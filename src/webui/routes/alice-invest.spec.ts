import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ReadinessEvidenceStore } from '../../domain/alice-invest/readiness/evidence-store.js'
import { createAliceInvestRoutes } from './alice-invest.js'
describe('Alice Invest operational route', () => {
  it('returns a sanitised evidence projection and false execution only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alice-invest-route-')); const store = new ReadinessEvidenceStore(join(dir, 'evidence.jsonl')); await store.init()
    try { await store.append({ id: 'private-id', capability: 'global', criterion: 'valid_config', status: 'passed', observedAt: '2026-07-17T00:00:00.000Z', source: 'local', validationRunId: 'private-run', details: 'safe detail' }); const body = await (await createAliceInvestRoutes({ evidenceStore: store }).request('/')).json() as any; expect(body.executionEnabled).toBe(false); expect(body.readiness[0].evidence[0]).not.toHaveProperty('id'); expect(body.readiness[0].evidence[0]).not.toHaveProperty('validationRunId') } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
