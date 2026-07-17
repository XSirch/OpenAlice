import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ReadinessEvidenceStore } from './evidence-store.js'

const evidence = { id: 'run-1/global/config', capability: 'global' as const, criterion: 'valid config', status: 'passed' as const, observedAt: '2026-07-17T00:00:00.000Z', source: 'local-test', validationRunId: 'run-1' }
describe('ReadinessEvidenceStore', () => {
  it('persists append-only idempotent evidence across restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openalice-evidence-')); const path = join(dir, 'evidence.jsonl')
    try { const first = new ReadinessEvidenceStore(path); await first.init(); expect(await first.append(evidence)).toBe(true); expect(await first.append(evidence)).toBe(false); const restarted = new ReadinessEvidenceStore(path); await restarted.init(); expect(restarted.list('global')).toEqual([evidence]) } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
