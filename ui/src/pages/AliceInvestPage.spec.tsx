import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AliceInvestPage } from './AliceInvestPage'
import { aliceInvestApi } from '../api/alice-invest'
import { openFinanceApi } from '../api/open-finance'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const overview = {
  readiness: 'research_only' as const, executionEnabled: false as const, generatedAt: '2026-08-20T12:00:00.000Z',
  policy: { liquidityReservePct: '20', readiness: 'research_only' as const, executionEnabled: false as const, recommendationGenerationEnabled: false as const },
  capabilities: { treasuryPricing: true, switchSimulation: true, bankRanking: true, privateCreditAnalysis: true, financialExecution: false as const },
  sourceStates: [{ id: 'tesouro', label: 'Tesouro Transparente', mode: 'official_automatic' as const, state: 'fresh', freshness: 'daily' }],
}
const summary = {
  snapshot: { provider: 'pluggy' as const, fetchedAt: '2026-08-20T12:00:00.000Z', positions: [{ id: 'p1', name: 'Tesouro IPCA+ 2031', value: 130000, currency: 'BRL', institution: 'BTG', asOf: '2026-08-20' }] },
  fgc: { groups: [], eligibleAmountBRL: '0', estimatedCoverageAfterAggregateLimitBRL: '0', estimatedUncoveredBRL: '0', remainingAggregateLimitBRL: '1000000', policy: { effectiveFrom: '2017-12-22', referenceUrl: 'https://www.fgc.org.br/' }, disclaimer: 'fixture' },
  ladder: { asOf: '2026-08-20', buckets: { years_3_to_5: { currentAmountBRL: '130000', entries: [{ id: 'p1', issuer: 'Tesouro Nacional', productType: 'tesouro_ipca', maturityDate: '2031-08-20', redemption: 'at_maturity', liquidityDays: 1, currentAmountBRL: '130000', marketValueBRL: '130000', redemptionAmountBRL: null, annualGrossRatePct: '10', annualNetRatePct: '8', gaps: [] }] } }, disclaimer: 'fixture' },
}

function mockLoaded() {
  vi.spyOn(aliceInvestApi, 'load').mockResolvedValue({ executionEnabled: false, switches: { active_signal_monitor_enabled: false }, readiness: [{ capability: 'fixed_income', state: 'research_only', evaluatedAt: '2026-08-20T12:00:00.000Z', evidence: [{ criterion: 'execution_disabled', status: 'passed', observedAt: '2026-08-20T12:00:00.000Z', source: 'local' }], blockers: ['shadow validation'] }] })
  vi.spyOn(aliceInvestApi, 'fixedIncomeOverview').mockResolvedValue(overview)
  vi.spyOn(aliceInvestApi, 'fixedIncomeHistory').mockResolvedValue({ readiness: 'research_only', executionEnabled: false, history: { deliveries: [], manualOutcomes: [], audit: [] } })
  vi.spyOn(aliceInvestApi, 'fixedIncomeOpportunities').mockResolvedValue({ readiness: 'research_only', executionEnabled: false, opportunities: [] })
  vi.spyOn(aliceInvestApi, 'fixedIncomeShadowValidation').mockResolvedValue({ state: 'collecting', distinctObservationDays: 0, observationCount: 0, period: { from: null, to: null }, metrics: { staleDataEvents: 0, providerFailures: 0, alerts: 0, duplicateAlerts: 0, reviewedAlerts: 0, falsePositives: 0, falsePositiveRatePct: '0' }, blockers: ['minimum_30_distinct_days_not_met'], walkthrough: null, readiness: 'research_only', canEnableRecommendations: false })
  vi.spyOn(aliceInvestApi, 'fixedIncomeHealth').mockResolvedValue({ state: 'collecting', readiness: 'research_only', executionEnabled: false, checkedAt: '2026-08-20T12:00:00.000Z', monitor: { enabled: false, notificationsEnabled: false, lastEvent: null, circuitState: 'no_recent_open_event' }, operations: { auditEvents: 0, deliveries: 0, manualOutcomes: 0 } })
  vi.spyOn(aliceInvestApi, 'fixedIncomePositions').mockResolvedValue({ readiness: 'research_only', executionEnabled: false, fetchedAt: '2026-08-20T12:00:00.000Z', gaps: [], unclassified: [], positions: [{ id: 'public-p1', product: { productType: 'tesouro_direto', issuer: { legalName: 'Tesouro Nacional' }, rate: { kind: 'ipca_plus', spreadPct: '6' }, issueDate: '2024-08-20', maturityDate: '2031-08-20', liquidity: { redemption: 'daily', settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'ineligible' }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] }, investedAmountBRL: '100000', currentAmountBRL: '130000', custodyAsOf: '2026-08-20', source: { provider: 'pluggy' } }] })
  vi.spyOn(openFinanceApi, 'fixedIncomeSummary').mockResolvedValue(summary)
}

describe('AliceInvestPage', () => {
  it('renders the fixed-income overview and keeps execution unavailable', async () => {
    mockLoaded()
    render(<AliceInvestPage />)
    await waitFor(() => expect(screen.getByText('Mapa da carteira')).toBeTruthy())
    expect(screen.getByText('Tesouro Nacional')).toBeTruthy()
    expect(screen.getByText('Derived readiness')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Operação' }))
    expect(screen.getByText('Monitor de renda fixa')).toBeTruthy()
    expect(screen.getByText('desativado')).toBeTruthy()
    expect(screen.getByText(/Execution is permanently unavailable/)).toBeTruthy()
  })

  it('navigates source and simulator states without exposing an execution action', async () => {
    mockLoaded()
    const simulate = vi.spyOn(aliceInvestApi, 'simulateFixedIncomeSwitch').mockResolvedValue({ decision: 'sell_and_reinvest', actionable: false, readiness: 'research_only', hold: { netFinalBRL: '181687.36' }, reinvest: { netFinalBRL: '206326.23' }, delta: { netBRL: '24638.87', annualizedUpliftPct: '2.576' }, constraints: [{ id: 'reserve', passed: true }], calculationTraceId: 'a'.repeat(64) })
    render(<AliceInvestPage />)
    await waitFor(() => expect(screen.getByText('Mapa da carteira')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Fontes' }))
    expect(screen.getByText('Tesouro Transparente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Simulador' }))
    await waitFor(() => expect((screen.getByLabelText('Posição associada') as HTMLSelectElement).value).toBe('public-p1'))
    fireEvent.click(screen.getByRole('button', { name: 'Simular sem executar' }))
    await waitFor(() => expect(screen.getByText('sell_and_reinvest')).toBeTruthy())
    expect(simulate).toHaveBeenCalledWith(expect.objectContaining({ positionId: 'public-p1' }))
    expect(screen.queryByRole('button', { name: /comprar|vender|executar ordem/i })).toBeNull()
  })

  it('fails closed in the rendered error state', async () => {
    vi.spyOn(aliceInvestApi, 'load').mockRejectedValue(new Error('offline'))
    vi.spyOn(aliceInvestApi, 'fixedIncomeOverview').mockRejectedValue(new Error('offline'))
    vi.spyOn(aliceInvestApi, 'fixedIncomeHistory').mockRejectedValue(new Error('offline'))
    vi.spyOn(aliceInvestApi, 'fixedIncomeOpportunities').mockRejectedValue(new Error('offline'))
    vi.spyOn(aliceInvestApi, 'fixedIncomeShadowValidation').mockRejectedValue(new Error('offline'))
    vi.spyOn(aliceInvestApi, 'fixedIncomeHealth').mockRejectedValue(new Error('offline'))
    vi.spyOn(openFinanceApi, 'fixedIncomeSummary').mockRejectedValue(new Error('offline'))
    render(<AliceInvestPage />)
    await waitFor(() => expect(screen.getByText(/Nenhuma capacidade deve ser tratada como pronta/)).toBeTruthy())
  })

  it('fetches CVM evidence without turning it into an automatic score', async () => {
    mockLoaded()
    vi.spyOn(aliceInvestApi, 'fixedIncomeCvmEvidence').mockResolvedValue({ readiness: 'research_only', executionEnabled: false, snapshot: { observedAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-28T12:00:00.000Z', quality: { score: 100, confidence: 95, criticalFieldsMissing: [] }, payload: { year: '2026', statements: [{ kind: 'ITR', company: 'Companhia Exemplo', referenceDate: '2026-06-30', statement: 'DRE', accountCode: '3.11', account: 'Lucro líquido', value: '1234.56' }], events: [] }, provenance: [{ publisher: 'Comissão de Valores Mobiliários', sourceUrl: 'https://dados.cvm.gov.br/itr.zip', dataAsOf: '2026-06-30', retrievedAt: '2026-08-20T12:00:00.000Z', rawPayloadChecksum: 'a'.repeat(64) }] } })
    render(<AliceInvestPage />)
    await waitFor(() => expect(screen.getByText('Mapa da carteira')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Crédito' }))
    fireEvent.change(screen.getByLabelText('Código CVM'), { target: { value: '9512' } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar sem recomendar' }))
    await waitFor(() => expect(screen.getByText('100%')).toBeTruthy())
    expect(screen.getByText(/não rating/i)).toBeTruthy()
    vi.spyOn(aliceInvestApi, 'inspectFixedIncomeDocument').mockResolvedValue({ readiness: 'research_only', executionEnabled: false, persisted: false, document: { fileName: 'evidence.txt', contentType: 'text/plain', byteLength: 8, documentHash: 'a'.repeat(64), extractionState: 'text_extracted', extractedText: 'evidence', trust: 'untrusted_document_content', securitySignals: [] } })
    fireEvent.change(screen.getByLabelText('Documento de crédito'), { target: { files: [new File(['evidence'], 'evidence.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(screen.getByText('text_extracted')).toBeTruthy())
    expect(screen.getByText('untrusted_document_content')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /comprar|vender|aprovar/i })).toBeNull()
  })

  it('opens a read-only position detail and runs deterministic credit analysis', async () => {
    mockLoaded()
    vi.spyOn(aliceInvestApi, 'fixedIncomePositionDetail').mockResolvedValue({ readiness: 'research_only', executionEnabled: false, recommendationHistory: [], gaps: ['lots_missing'], detail: { updatedAt: '2026-08-20T12:00:00.000Z', lots: [], cashFlows: [], risk: null, documents: [] }, calculationMemory: { available: false, reason: 'Simulação explícita necessária.', history: [] }, position: { id: 'public-p1', product: { productType: 'tesouro_direto', issuer: { legalName: 'Tesouro Nacional' }, rate: { kind: 'ipca_plus', spreadPct: '6' }, issueDate: '2024-08-20', maturityDate: '2031-08-20', liquidity: { redemption: 'daily', settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'ineligible' }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] }, investedAmountBRL: '100000', currentAmountBRL: '130000', custodyAsOf: '2026-08-20', source: { provider: 'pluggy' } } })
    vi.spyOn(aliceInvestApi, 'analyzeFixedIncomeCredit').mockResolvedValue({ readiness: 'research_only', actionable: false, assetId: 'debenture:Companhia Exemplo', deterministicScore: 63, decision: 'insufficient_data', adjustedNetPremiumRangePct: { low: '-0.5', high: '1' }, reasonCodes: ['liquidity_score_missing'], evidence: [], calculationTraceId: 'c'.repeat(64), methodologyId: 'private-credit-analysis@1' })
    render(<AliceInvestPage />)
    await waitFor(() => expect(screen.getByText('Mapa da carteira')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Posições' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver cálculo' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Ver cálculo' }))
    await waitFor(() => expect(screen.getByText('Simulação explícita necessária.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Crédito' }))
    fireEvent.change(screen.getByLabelText('Emissor'), { target: { value: 'Companhia Exemplo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calcular parecer sem executar' }))
    await waitFor(() => expect(screen.getByText('dados insuficientes')).toBeTruthy())
    expect(screen.getByText('63/100')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /comprar|vender|executar ordem/i })).toBeNull()
  })
})
