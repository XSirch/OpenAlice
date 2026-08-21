import { describe, expect, it, vi } from 'vitest'

import { createFixedIncomeSnapshot } from '../domain/alice-invest/fixed-income/providers/provider-contract.js'
import { createAliceInvestFixedIncomeTools } from './alice-invest-fixed-income.js'

const snapshot = createFixedIncomeSnapshot({
  dataset: 'treasury_prices', providerId: 'tesouro', observedAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-21T12:00:00.000Z',
  provenance: [{ publisher: 'Tesouro', sourceId: 'source', sourceUrl: 'https://www.tesourotransparente.gov.br/', decision: 'automate', access: 'official_public_download', method: 'GET', parameters: {}, license: 'open_data', termsReviewedAt: '2026-08-20', termsVersion: 'fixture', retrievedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-19', rawPayloadChecksum: 'a'.repeat(64), parserVersion: 'fixture@1', originalIdentifiers: { resourceId: 'external-id' } }],
  quality: { score: 100, confidence: 100, criticalFieldsMissing: [] }, payload: { referenceDate: '2026-08-19', rows: [] },
})

describe('Alice Invest fixed-income tools', () => {
  it('exposes research-only overview and deterministic simulation without execution tools', async () => {
    const fetchTreasury = vi.fn(async () => snapshot)
    const simulateSwitch = vi.fn(() => ({ decision: 'maintain', actionable: false, readiness: 'research_only' }))
    const rankOpportunities = vi.fn(() => ({ readiness: 'research_only', actionable: false }))
    const analyzeCredit = vi.fn(() => ({ readiness: 'research_only', actionable: false }))
    const fetchCreditEvidence = vi.fn(async () => ({ ...snapshot, dataset: 'private_credit_documents' as const, payload: { cvmCode: '9512', year: '2026' } }))
    const inspectCreditDocument = vi.fn(async () => ({ fileName: 'evidence.txt', contentType: 'text/plain', byteLength: 8, documentHash: 'a'.repeat(64), extractionState: 'text_extracted' as const, extractedText: 'evidence', trust: 'untrusted_document_content' as const, securitySignals: [], provenance: snapshot.provenance[0]! }))
    const operations = { recordManualOutcome: vi.fn(async () => undefined) }
    const loadPortfolio = vi.fn(async () => ({ positions: [], unresolved: [], unclassifiedPositionIds: [] }))
    const tools = createAliceInvestFixedIncomeTools({ fetchTreasury, fetchCreditEvidence, inspectCreditDocument, simulateSwitch, rankOpportunities, analyzeCredit, operations, loadPortfolio, now: () => new Date('2026-08-20T12:00:00.000Z') })
    expect(Object.keys(tools).sort()).toEqual(['aliceInvestAnalyzePrivateCredit', 'aliceInvestCompareFixedIncomeOpportunities', 'aliceInvestExplainFixedIncomeRecommendation', 'aliceInvestFetchPrivateCreditEvidence', 'aliceInvestFixedIncomeOverview', 'aliceInvestFixedIncomePositionDetail', 'aliceInvestInspectPrivateCreditDocument', 'aliceInvestRecordManualRecommendationOutcome', 'aliceInvestSimulateFixedIncomeSwitch'])
    const overview = await tools.aliceInvestFixedIncomeOverview.execute!({}, { toolCallId: 'test', messages: [] }) as Record<string, unknown>
    expect(overview).toMatchObject({ readiness: 'research_only', executionEnabled: false })
    expect(fetchTreasury).toHaveBeenCalledOnce()
    await tools.aliceInvestCompareFixedIncomeOpportunities.execute!({} as never, { toolCallId: 'test', messages: [] })
    expect(rankOpportunities).toHaveBeenCalledOnce()
    await tools.aliceInvestRecordManualRecommendationOutcome.execute!({ recommendationId: 'rec-1', recordedAt: '2026-08-20T12:00:00.000Z', outcome: 'reviewed' }, { toolCallId: 'test', messages: [] })
    expect(operations.recordManualOutcome).toHaveBeenCalledOnce()
    expect(await tools.aliceInvestFixedIncomePositionDetail.execute!({ positionId: 'missing' }, { toolCallId: 'test', messages: [] })).toMatchObject({ ok: false })
    const creditEvidence = await tools.aliceInvestFetchPrivateCreditEvidence.execute!({ cvmCode: '9512', year: 2026 }, { toolCallId: 'test', messages: [] })
    expect(JSON.stringify(creditEvidence)).not.toContain('9512')
    await tools.aliceInvestInspectPrivateCreditDocument.execute!({ fileName: 'evidence.txt', contentType: 'text/plain', contentBase64: Buffer.from('evidence').toString('base64'), sourceKind: 'user_supplied', sourceUrl: 'https://openalice.local/evidence.txt', observedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-20', termsReviewedAt: '2026-08-20' }, { toolCallId: 'test', messages: [] })
    expect(inspectCreditDocument).toHaveBeenCalledOnce()
  })
})
