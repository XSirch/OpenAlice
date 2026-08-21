import { describe, expect, it, vi } from 'vitest'

import { createFixedIncomeSnapshot } from '../../domain/alice-invest/fixed-income/providers/provider-contract.js'
import { createFixedIncomeRoutes } from './fixed-income.js'

const snapshot = createFixedIncomeSnapshot({
  dataset: 'treasury_prices', providerId: 'tesouro-transparente', observedAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-21T12:00:00.000Z',
  provenance: [{
    publisher: 'Tesouro Nacional', sourceId: 'tesouro-source', sourceUrl: 'https://www.tesourotransparente.gov.br/',
    decision: 'automate', access: 'official_public_download', method: 'GET', parameters: {}, license: 'open_data',
    termsReviewedAt: '2026-08-20', termsVersion: 'fixture', retrievedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-19',
    rawPayloadChecksum: 'a'.repeat(64), parserVersion: 'fixture@1', originalIdentifiers: { resourceId: 'external-resource-id' },
  }],
  quality: { score: 100, confidence: 100, criticalFieldsMissing: [] },
  payload: { resourceId: 'external-resource-id', resourceRevisionId: 'external-revision-id', referenceDate: '2026-08-19', rows: [] },
})

const classifiedPosition = {
  id: 'private-position-id',
  product: { productType: 'tesouro_direto' as const, issuer: { legalName: 'Tesouro Nacional' }, rate: { kind: 'ipca_plus' as const, spreadPct: '6' }, issueDate: '2024-08-20', maturityDate: '2031-08-20', liquidity: { redemption: 'daily' as const, settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'ineligible' as const }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] },
  investedAmountBRL: '100000', currentAmountBRL: '130000', acquiredDate: '2024-08-20', custodyAsOf: '2026-08-20', source: { provider: 'pluggy', positionId: 'external-position-id' },
}
const portfolioFixture = async () => ({ fetchedAt: '2026-08-20T12:00:00.000Z', custody: [], reconciliation: { positions: [classifiedPosition], unresolved: [], unclassifiedPositionIds: [] } })
const syntheticSwitchRequest = {
  asOf: '2026-08-20T12:00:00.000Z', targetDate: '2031-08-20', sellFraction: '1', sameInstrument: false,
  hold: { principalBRL: '100000', annualIndexPct: '4', annualSpreadPct: '6', yearsFromAcquisition: '7', incomeTaxRate: '0.15', futureCostsBRL: '1500' },
  sale: { grossProceedsBRL: '130000', realizedIncomeTaxBRL: '4500', exitCostsBRL: '260' },
  replacement: { annualRatePct: '10.5', years: '5', incomeTaxRate: '0', costsBRL: '0', availability: 'confirmed', validUntil: '2026-08-20T12:30:00.000Z', fgcConfirmed: true },
  constraints: { portfolioTotalBRL: '600000', liquidReserveAfterBRL: '150000', minimumReservePct: '20', concentrationValid: true, dataQuality: '85', minimumDataQuality: '85', confidence: '80', minimumConfidence: '80', uncertaintyBRL: '10000', minimumBenefitUncertaintyRatio: '2', minimumBenefitBRL: '500', criticalDataFresh: true },
  sources: [{ publisher: 'Synthetic fixture', sourceId: 'route-fixture', sourceUrl: 'https://openalice.local/fixture', decision: 'manual', access: 'user_supplied', method: 'manual_upload', parameters: {}, license: 'user_supplied', termsReviewedAt: '2026-08-20', termsVersion: 'fixture', retrievedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-20', rawPayloadChecksum: 'c'.repeat(64), parserVersion: 'fixture@1', originalIdentifiers: {} }],
}

describe('fixed-income read-only routes', () => {
  it('reports a research-only capability and source overview', async () => {
    const app = createFixedIncomeRoutes({ now: () => new Date('2026-08-20T12:00:00.000Z') })
    const response = await app.request('/overview')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      readiness: 'research_only', executionEnabled: false,
      policy: { liquidityReservePct: '20', executionEnabled: false },
      capabilities: { treasuryPricing: true, bankRanking: true, privateCreditAnalysis: true, financialExecution: false },
    })
  })
  it('returns a redacted Telegram portfolio summary without execution affordances', async () => {
    const product = { productType: 'lca' as const, issuer: { legalName: 'Banco Privado' }, rate: { kind: 'fixed' as const, annualRatePct: '12' }, issueDate: '2026-01-01', maturityDate: '2027-01-01', liquidity: { redemption: 'at_maturity' as const, settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'unknown' as const }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] }
    const position = { id: 'private-position', product, investedAmountBRL: '90000', currentAmountBRL: '100000', custodyAsOf: '2026-08-20', source: { provider: 'pluggy', positionId: 'external-position-id' } }
    const policy = { version: 1 as const, enabled: true, defaultRiskProfile: 'moderate' as const, liquidityReservePct: '20', concentrationLimits: { privateCreditPct: '35', illiquidAssetsPct: '40', singleFgcConglomeratePct: '15', singleFgcConglomerateBRL: '225000' }, recommendationThresholds: { minimumBenefitBRL: '100', minimumBenefitPct: '0.5', cooldownDays: 7 }, taxPolicyId: 'tax@1', scenarioPolicyId: 'scenario@1', killSwitches: { providerRefreshEnabled: false, opportunityScanEnabled: false, creditMonitorEnabled: false, recommendationGenerationEnabled: false as const, notificationsEnabled: false }, readiness: 'research_only' as const, executionEnabled: false as const, recommendationGenerationEnabled: false as const }
    const app = createFixedIncomeRoutes({
      loadPortfolio: async () => ({ fetchedAt: '2026-08-20T12:00:00.000Z', custody: [{ id: 'external-position-id', name: 'Private LCA', value: 100000, currency: 'BRL' }], reconciliation: { positions: [position], unresolved: [], unclassifiedPositionIds: [] } }),
      state: { listOpportunities: vi.fn(async () => []), recordImport: vi.fn(async () => true) },
      operations: { read: vi.fn(async () => ({ version: 1 as const, deliveries: [], manualOutcomes: [], audit: [] })), recordManualOutcome: vi.fn() }, readPolicy: async () => policy,
    })
    const response = await app.request('/telegram-summary')
    expect(response.status).toBe(200)
    const raw = await response.text()
    expect(raw).toContain('R$ 100.000,00')
    expect(raw).toContain('Nenhuma ordem')
    expect(raw).not.toContain('external-position-id')
    expect(raw).not.toContain('Banco Privado')
  })
  it('returns redacted Tesouro observations without exposing external IDs', async () => {
    const fetchTreasury = vi.fn(async () => snapshot)
    const app = createFixedIncomeRoutes({ fetchTreasury, simulateSwitch: vi.fn() })
    const response = await app.request('/treasury/prices?referenceDate=2026-08-19')
    expect(response.status).toBe(200)
    const raw = await response.text()
    expect(raw).not.toContain('external-resource-id')
    expect(raw).not.toContain('external-revision-id')
    expect(JSON.parse(raw)).toMatchObject({ readiness: 'research_only', executionEnabled: false, snapshot: { dataset: 'treasury_prices' } })
    expect(fetchTreasury).toHaveBeenCalledWith(expect.objectContaining({ dataset: 'treasury_prices', identifiers: { referenceDate: '2026-08-19' } }))
  })

  it('validates simulations strictly and does not accept execution-shaped fields', async () => {
    const simulateSwitch = vi.fn(() => ({ decision: 'maintain', actionable: false, readiness: 'research_only' }))
    const app = createFixedIncomeRoutes({ fetchTreasury: vi.fn(), simulateSwitch })
    const response = await app.request('/simulations/switch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'buy' }),
    })
    expect(response.status).toBe(400)
    expect(simulateSwitch).not.toHaveBeenCalled()
  })

  it('exposes position evidence without raw custody IDs and rejects execution-shaped evidence', async () => {
    const emptyRecord = { positionId: classifiedPosition.id, updatedAt: '2026-08-20T12:00:00.000Z', lots: [], cashFlows: [], risk: null, documents: [], calculations: [] }
    const replaceEvidence = vi.fn(async (_positionId, input) => ({ ...emptyRecord, ...input }))
    const positionState = { get: vi.fn(async () => emptyRecord), replaceEvidence, recordCalculation: vi.fn(async () => true) }
    const operations = { read: vi.fn(async () => ({ version: 1 as const, deliveries: [], manualOutcomes: [], audit: [] })), recordManualOutcome: vi.fn() }
    const app = createFixedIncomeRoutes({ loadPortfolio: portfolioFixture, positionState, operations })
    const positions = await (await app.request('/positions')).json() as { positions: Array<{ id: string }> }
    const publicPositionId = positions.positions[0]!.id
    const detail = await app.request(`/positions/${publicPositionId}`)
    const raw = await detail.text()
    expect(detail.status).toBe(200)
    expect(raw).not.toContain(classifiedPosition.id)
    expect(raw).not.toContain('external-position-id')
    expect(JSON.parse(raw)).toMatchObject({ executionEnabled: false, gaps: expect.arrayContaining(['lots_missing', 'position_calculation_missing']), calculationMemory: { available: false, history: [] } })

    const evidence = { lots: [{ id: 'lot-1', acquisitionDate: '2024-08-20', quantity: '10', unitCostBRL: '10000', totalCostBRL: '100000', accruedFeesBRL: '0', taxLotMethod: 'provider_reported', source: { provider: 'statement', observedAt: '2026-08-20T12:00:00.000Z', evidenceChecksum: 'a'.repeat(64) } }], cashFlows: [], risk: null, documents: [] }
    const stored = await app.request(`/positions/${publicPositionId}/evidence`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evidence) })
    expect(stored.status, await stored.clone().text()).toBe(200)
    expect(replaceEvidence).toHaveBeenCalledWith(classifiedPosition.id, expect.objectContaining({ lots: [expect.objectContaining({ positionId: classifiedPosition.id })] }))
    expect((await app.request(`/positions/${publicPositionId}/evidence`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...evidence, action: 'buy' }) })).status).toBe(400)
  })

  it('associates an explicit simulation trace with a classified position only', async () => {
    const recordCalculation = vi.fn(async () => true)
    const positionState = { get: vi.fn(), replaceEvidence: vi.fn(), recordCalculation }
    const app = createFixedIncomeRoutes({ loadPortfolio: portfolioFixture, positionState })
    const positions = await (await app.request('/positions')).json() as { positions: Array<{ id: string }> }
    const response = await app.request('/simulations/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...syntheticSwitchRequest, positionId: positions.positions[0]!.id }) })
    expect(response.status).toBe(200)
    expect(recordCalculation).toHaveBeenCalledWith(classifiedPosition.id, expect.objectContaining({ calculationTraceId: expect.stringMatching(/^[a-f0-9]{64}$/), decision: 'sell_and_reinvest', targetDate: '2031-08-20' }))
    expect((await app.request('/simulations/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...syntheticSwitchRequest, positionId: 'unknown' }) })).status).toBe(404)
  })

  it('keeps investment ranking and manual import endpoints simulation-only', async () => {
    const rankOpportunities = vi.fn()
    const app = createFixedIncomeRoutes({ fetchTreasury: vi.fn(), simulateSwitch: vi.fn(), rankOpportunities })
    const invalid = await app.request('/simulations/invest', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'buy' }),
    })
    expect(invalid.status).toBe(400)
    expect(rankOpportunities).not.toHaveBeenCalled()
    const artifact = Buffer.from(JSON.stringify({ schemaVersion: 1, offers: [] }), 'utf8').toString('base64')
    const imported = await app.request('/imports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        fileName: 'empty.json', contentBase64: artifact, importedAt: '2026-08-20T12:00:00.000Z', termsReviewedAt: '2026-08-20',
      }),
    })
    expect(imported.status).toBe(400)
  })

  it('rejects execution-shaped private-credit requests before analysis', async () => {
    const analyzeCredit = vi.fn()
    const app = createFixedIncomeRoutes({ fetchTreasury: vi.fn(), simulateSwitch: vi.fn(), analyzeCredit })
    const response = await app.request('/credit-analysis', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve-trade' }),
    })
    expect(response.status).toBe(400)
    expect(analyzeCredit).not.toHaveBeenCalled()
  })

  it('fetches official CVM credit evidence while redacting the issuer code', async () => {
    const fetchCreditEvidence = vi.fn(async () => ({ ...snapshot, dataset: 'private_credit_documents' as const, payload: { cvmCode: '9512', year: '2026', statements: [], events: [] } }))
    const app = createFixedIncomeRoutes({ fetchTreasury: vi.fn(), fetchCreditEvidence, simulateSwitch: vi.fn() })
    const response = await app.request('/credit-sources/cvm?cvmCode=9512&year=2026')
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('9512')
    expect(fetchCreditEvidence).toHaveBeenCalledWith(expect.objectContaining({ dataset: 'private_credit_documents', identifiers: { cvmCode: '9512', year: '2026' } }))
  })

  it('inspects bounded credit documents without persistence or execution', async () => {
    const inspectCreditDocument = vi.fn(async () => ({ fileName: 'evidence.txt', contentType: 'text/plain', byteLength: 8, documentHash: 'a'.repeat(64), extractionState: 'text_extracted' as const, extractedText: 'evidence', trust: 'untrusted_document_content' as const, securitySignals: [], provenance: snapshot.provenance[0]! }))
    const app = createFixedIncomeRoutes({ fetchTreasury: vi.fn(), simulateSwitch: vi.fn(), inspectCreditDocument })
    const response = await app.request('/credit-documents/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'evidence.txt', contentType: 'text/plain', contentBase64: Buffer.from('evidence').toString('base64'), sourceKind: 'user_supplied', sourceUrl: 'https://openalice.local/evidence.txt', observedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-20', termsReviewedAt: '2026-08-20' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ persisted: false, executionEnabled: false, document: { extractionState: 'text_extracted' } })
    expect((await app.request('/credit-documents/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentBase64: '***' }) })).status).toBe(400)
  })

  it('records only a manual outcome and reports no execution capability', async () => {
    const operations = { read: vi.fn(async () => ({ version: 1 as const, deliveries: [], manualOutcomes: [{ recommendationId: 'external-rec-id', recordedAt: '2026-08-20T12:00:00.000Z', outcome: 'reviewed' as const }], audit: [] })), recordManualOutcome: vi.fn(async () => undefined) }
    const app = createFixedIncomeRoutes({ fetchTreasury: vi.fn(), simulateSwitch: vi.fn(), operations })
    const response = await app.request('/recommendations/rec-redacted/manual-outcome', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recordedAt: '2026-08-20T12:00:00.000Z', outcome: 'executed_elsewhere' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stored: true, executionEnabled: false })
    expect(operations.recordManualOutcome).toHaveBeenCalledWith({ recommendationId: 'rec-redacted', recordedAt: '2026-08-20T12:00:00.000Z', outcome: 'executed_elsewhere' })
    const history = await app.request('/history')
    expect(await history.text()).not.toContain('external-rec-id')
  })

  it('exposes the complete fail-closed route contract without inventing portfolio or recommendations', async () => {
    const policy = {
      version: 1 as const, enabled: true, defaultRiskProfile: 'moderate' as const, liquidityReservePct: '20',
      concentrationLimits: { privateCreditPct: '35', illiquidAssetsPct: '40', singleFgcConglomeratePct: '15', singleFgcConglomerateBRL: '225000' },
      recommendationThresholds: { minimumBenefitBRL: '100', minimumBenefitPct: '0.5', cooldownDays: 7 },
      taxPolicyId: 'tax@1', scenarioPolicyId: 'scenario@1', readiness: 'research_only' as const, executionEnabled: false as const, recommendationGenerationEnabled: false as const,
      killSwitches: { providerRefreshEnabled: false, opportunityScanEnabled: false, creditMonitorEnabled: false, recommendationGenerationEnabled: false as const, notificationsEnabled: false },
    }
    const writePolicy = vi.fn(async (input: unknown) => input as typeof policy)
    const recordWalkthrough = vi.fn(async () => true)
    const state = { listOpportunities: vi.fn(async () => []), recordImport: vi.fn(async () => true) }
    const operations = { read: vi.fn(async () => ({ version: 1 as const, deliveries: [], manualOutcomes: [], audit: [] })), recordManualOutcome: vi.fn(async () => undefined) }
    const app = createFixedIncomeRoutes({
      fetchTreasury: vi.fn(), simulateSwitch: vi.fn(), state, operations, readPolicy: async () => policy, writePolicy,
      loadPortfolio: async () => ({ fetchedAt: '2026-08-20T12:00:00.000Z', custody: [], reconciliation: { positions: [], unresolved: [], unclassifiedPositionIds: [] } }),
      shadowValidation: { report: vi.fn(async () => ({ state: 'collecting' as const, distinctObservationDays: 0, observationCount: 0, period: { from: null, to: null }, metrics: { staleDataEvents: 0, providerFailures: 0, alerts: 0, duplicateAlerts: 0, reviewedAlerts: 0, falsePositives: 0, falsePositiveRatePct: '0.00000000' }, maximumAbsoluteCalculationDifferenceBRL: '0.00', thresholdSensitivity: [], blockers: ['minimum_30_distinct_days_not_met'], walkthrough: null, methodologyId: 'fixed-income-shadow-validation@1' as const, readiness: 'research_only' as const, canEnableRecommendations: false as const })), recordWalkthrough },
    })
    expect((await app.request('/positions')).status).toBe(200)
    expect(await (await app.request('/recommendations')).json()).toMatchObject({ generationEnabled: false, recommendations: [] })
    expect((await app.request('/recommendations/missing')).status).toBe(404)
    expect((await app.request('/positions/missing')).status).toBe(404)
    expect((await app.request('/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(409)
    const walkthrough = { completedAt: '2026-08-21T12:00:00.000Z', reviewer: 'human-maintainer', result: 'passed', notes: 'Revisão humana documentada.' }
    expect((await app.request('/shadow-validation/walkthrough', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(walkthrough) })).status).toBe(200)
    expect(recordWalkthrough).toHaveBeenCalledWith(walkthrough)
    expect((await app.request('/shadow-validation/walkthrough', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...walkthrough, action: 'enable' }) })).status).toBe(400)
    expect(await (await app.request('/health')).json()).toMatchObject({ state: 'collecting', executionEnabled: false, shadow: { distinctObservationDays: 0 }, monitor: { enabled: false, notificationsEnabled: false, circuitState: 'no_recent_open_event' } })
    const changed = await app.request('/policy', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ liquidityReservePct: '25', killSwitches: { opportunityScanEnabled: true, notificationsEnabled: true } }) })
    expect(changed.status).toBe(200)
    expect(writePolicy).toHaveBeenCalledWith(expect.objectContaining({ liquidityReservePct: '25', executionEnabled: false, recommendationGenerationEnabled: false, killSwitches: expect.objectContaining({ opportunityScanEnabled: true, notificationsEnabled: true, recommendationGenerationEnabled: false }) }))
    const forbidden = await app.request('/policy', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ executionEnabled: true }) })
    expect(forbidden.status).toBe(400)
    const recommendationSwitch = await app.request('/policy', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ killSwitches: { recommendationGenerationEnabled: true } }) })
    expect(recommendationSwitch.status).toBe(400)
  })
})
