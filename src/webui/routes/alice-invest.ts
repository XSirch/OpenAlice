import { Hono } from 'hono'
import { readAliceInvestConfig } from '../../core/alice-invest-config.js'
import { ReadinessEvidenceStore } from '../../domain/alice-invest/readiness/evidence-store.js'
import { projectAllReadiness } from '../../domain/alice-invest/readiness/projection.js'

export interface AliceInvestRouteDeps { evidenceStore?: ReadinessEvidenceStore }

/** Read-only operational snapshot: config has no secrets and execution is not writable. */
export function createAliceInvestRoutes(deps: AliceInvestRouteDeps = {}) {
  const app = new Hono()
  const evidenceStore = deps.evidenceStore ?? new ReadinessEvidenceStore()
  app.get('/', async (c) => {
    const config = await readAliceInvestConfig()
    await evidenceStore.init()
    const readiness = projectAllReadiness(evidenceStore.list()).map(({ capability, state, evaluatedAt, evidence, blockers }) => ({
      capability, state, evaluatedAt,
      evidence: evidence.map(({ criterion, status, observedAt, source, details }) => ({ criterion, status, observedAt, source, ...(details ? { details } : {}) })),
      blockers,
    }))
    return c.json({ readiness, switches: config.kill_switches, executionEnabled: false })
  })
  return app
}
