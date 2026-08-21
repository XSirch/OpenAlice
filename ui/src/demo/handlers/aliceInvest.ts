import { http, HttpResponse } from 'msw'

export const aliceInvestHandlers = [
  http.get('/api/alice-invest', () => HttpResponse.json({
    executionEnabled: false,
    switches: { active_signal_monitor_enabled: false, signal_notifications_enabled: false },
    readiness: [{ capability: 'fixed_income', state: 'research_only', evaluatedAt: '2026-08-20T12:00:00.000Z', evidence: [{ criterion: 'execution_disabled', status: 'passed', observedAt: '2026-08-20T12:00:00.000Z', source: 'demo' }], blockers: ['shadow validation not completed'] }],
  })),
  http.get('/api/alice-invest/fixed-income/overview', () => HttpResponse.json({
    readiness: 'research_only', executionEnabled: false, generatedAt: '2026-08-20T12:00:00.000Z',
    policy: { liquidityReservePct: '20', readiness: 'research_only', executionEnabled: false, recommendationGenerationEnabled: false },
    capabilities: { treasuryPricing: true, switchSimulation: true, bankRanking: true, privateCreditAnalysis: true, financialExecution: false },
    sourceStates: [
      { id: 'tesouro-transparente', label: 'Tesouro Transparente', mode: 'official_automatic', state: 'fresh', freshness: 'daily' },
      { id: 'bcb-ifdata', label: 'BCB IFData', mode: 'official_automatic', state: 'fresh', freshness: 'quarterly' },
      { id: 'anbima-public', label: 'ANBIMA pública', mode: 'manual_import', state: 'manual_only', freshness: 'source_dependent' },
      { id: 'btg-auvp-offers', label: 'BTG/AUVP', mode: 'user_confirmation', state: 'confirmation_required', freshness: 'up_to_2_hours' },
    ],
  })),
  http.get('/api/open-finance/fixed-income/summary', () => HttpResponse.json({
    snapshot: { provider: 'pluggy', fetchedAt: '2026-08-20T11:30:00.000Z', positions: [
      { id: 'position-redacted-1', name: 'Tesouro IPCA+ 2031', value: 130000, originalAmount: 100000, currency: 'BRL', institution: 'BTG Pactual', asOf: '2026-08-20' },
      { id: 'position-redacted-2', name: 'LCA Banco Exemplo', value: 50000, originalAmount: 48000, currency: 'BRL', institution: 'BTG Pactual', asOf: '2026-08-20' },
    ] },
    fgc: { groups: [{ conglomerate: 'Conglomerado Exemplo Confirmado', eligibleAmountBRL: '50000.00', estimatedCoveredBeforeAggregateLimitBRL: '50000.00', estimatedUncoveredBRL: '0.00' }], eligibleAmountBRL: '50000.00', estimatedCoverageAfterAggregateLimitBRL: '50000.00', estimatedUncoveredBRL: '0.00', remainingAggregateLimitBRL: '950000.00', policy: { effectiveFrom: '2017-12-22', referenceUrl: 'https://www.fgc.org.br/sobre-garantia-fgc' }, disclaimer: 'Estimativa; confirme elegibilidade e conglomerado.' },
    ladder: { asOf: '2026-08-20', buckets: { up_to_30_days: { currentAmountBRL: '0.00', entries: [] }, days_31_to_90: { currentAmountBRL: '0.00', entries: [] }, days_91_to_365: { currentAmountBRL: '0.00', entries: [] }, years_1_to_3: { currentAmountBRL: '0.00', entries: [] }, years_3_to_5: { currentAmountBRL: '180000.00', entries: [{ id: 'ladder-redacted-1', issuer: 'Tesouro Nacional', productType: 'tesouro_ipca', maturityDate: '2031-08-20', redemption: 'at_maturity', liquidityDays: 1, currentAmountBRL: '130000.00', marketValueBRL: '130000.00', redemptionAmountBRL: null, annualGrossRatePct: '10.24', annualNetRatePct: '8.71', gaps: [] }, { id: 'ladder-redacted-2', issuer: 'Banco Exemplo', productType: 'lca', maturityDate: '2031-08-20', redemption: 'at_maturity', liquidityDays: 1825, currentAmountBRL: '50000.00', marketValueBRL: null, redemptionAmountBRL: null, annualGrossRatePct: '10.50', annualNetRatePct: '10.50', gaps: [] }] }, over_5_years: { currentAmountBRL: '0.00', entries: [] }, past_due: { currentAmountBRL: '0.00', entries: [] } }, disclaimer: 'Projeção de pesquisa, sem execução.' },
  })),
  http.get('/api/alice-invest/fixed-income/positions', () => HttpResponse.json({
    readiness: 'research_only', executionEnabled: false, fetchedAt: '2026-08-20T11:30:00.000Z', gaps: [], unclassified: [], positions: [{
      id: 'position-public-1', product: { productType: 'tesouro_direto', issuer: { legalName: 'Tesouro Nacional' }, rate: { kind: 'ipca_plus', spreadPct: '6' }, issueDate: '2024-08-20', maturityDate: '2031-08-20', liquidity: { redemption: 'daily', settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'ineligible' }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] }, investedAmountBRL: '100000', currentAmountBRL: '130000', acquiredDate: '2024-08-20', custodyAsOf: '2026-08-20', source: { provider: 'pluggy' },
    }],
  })),
  http.get('/api/alice-invest/fixed-income/positions/:id', () => HttpResponse.json({
    readiness: 'research_only', executionEnabled: false, recommendationHistory: [], gaps: ['current_comparable_rate_missing'],
    detail: {
      updatedAt: '2026-08-20T12:00:00.000Z',
      lots: [{ id: 'lot-public-1', acquisitionDate: '2024-08-20', quantity: '10', unitCostBRL: '10000', totalCostBRL: '100000', accruedFeesBRL: '0', taxLotMethod: 'provider_reported', source: { provider: 'statement', observedAt: '2026-08-20T12:00:00.000Z', evidenceChecksum: 'a'.repeat(64) } }],
      cashFlows: [{ id: 'flow-public-1', date: '2031-08-20', kind: 'principal', grossBRL: '181687.36', status: 'projected' }],
      risk: { durationYears: '4.1', modifiedDurationYears: '3.9', convexity: '18.2', dv01BRL: '510', creditScore: 100, liquidityScore: 92, structuralScore: 95, confidenceScore: 90, methodologyIds: ['treasury-risk@1'], dataAsOf: '2026-08-20' },
      documents: [{ id: 'doc-public-1', documentType: 'custody_statement', documentHash: 'b'.repeat(64), sourceUrl: 'https://openalice.local/evidence/custody-statement', dataAsOf: '2026-08-20' }],
    },
    calculationMemory: { available: true, latest: { calculationTraceId: '6cfa59dcc177ab5f2e196178b02e81e91f4c934485b03fc0fcb8ca2760bd4537', calculatedAt: '2026-08-20T12:00:00.000Z', targetDate: '2031-08-20', decision: 'sell_and_reinvest', holdNetBRL: '181687.36', reinvestNetBRL: '206326.23', netDeltaBRL: '24638.87', annualizedUpliftPct: '2.576', breakEvenAnnualNetRatePct: '7.924', methodologyIds: ['switch-analysis@1'] }, history: [{ calculationTraceId: '6cfa59dcc177ab5f2e196178b02e81e91f4c934485b03fc0fcb8ca2760bd4537', calculatedAt: '2026-08-20T12:00:00.000Z', targetDate: '2031-08-20', decision: 'sell_and_reinvest', holdNetBRL: '181687.36', reinvestNetBRL: '206326.23', netDeltaBRL: '24638.87', annualizedUpliftPct: '2.576', breakEvenAnnualNetRatePct: '7.924', methodologyIds: ['switch-analysis@1'] }] },
    position: { id: 'position-public-1', product: { productType: 'tesouro_direto', issuer: { legalName: 'Tesouro Nacional', conglomerate: 'Tesouro Nacional' }, rate: { kind: 'ipca_plus', spreadPct: '6' }, issueDate: '2024-08-20', maturityDate: '2031-08-20', liquidity: { redemption: 'daily', settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'ineligible' }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] }, investedAmountBRL: '100000', currentAmountBRL: '130000', marketValueBRL: '129800', redemptionAmountBRL: '129500', acquiredDate: '2024-08-20', custodyAsOf: '2026-08-20', source: { provider: 'pluggy' } },
  })),
  http.post('/api/alice-invest/fixed-income/simulations/switch', () => HttpResponse.json({
    decision: 'sell_and_reinvest', actionable: false, readiness: 'research_only',
    hold: { netFinalBRL: '181687.36' }, reinvest: { netFinalBRL: '206326.23' },
    delta: { netBRL: '24638.87', annualizedUpliftPct: '2.576' },
    constraints: [
      { id: 'critical_data_fresh', passed: true }, { id: 'offer_availability', passed: true },
      { id: 'fgc_confirmation', passed: true }, { id: 'liquidity_reserve', passed: true },
      { id: 'concentration', passed: true }, { id: 'data_quality', passed: true },
      { id: 'confidence', passed: true }, { id: 'benefit_uncertainty', passed: true },
      { id: 'materiality', passed: true }, { id: 'false_arbitrage', passed: true },
    ],
    calculationTraceId: '6cfa59dcc177ab5f2e196178b02e81e91f4c934485b03fc0fcb8ca2760bd4537',
  })),
  http.get('/api/alice-invest/fixed-income/history', () => HttpResponse.json({
    readiness: 'research_only', executionEnabled: false,
    history: { deliveries: [], manualOutcomes: [{ recommendationId: 'redacted:fixture', recordedAt: '2026-08-19T15:00:00.000Z', outcome: 'reviewed', note: 'Revisão humana registrada; nenhuma execução.' }], audit: [{ id: 'audit-demo-1', at: '2026-08-20T11:45:00.000Z', kind: 'scan', detail: 'Varredura read-only concluída com fontes disponíveis.' }] },
  })),
  http.get('/api/alice-invest/fixed-income/opportunities', () => HttpResponse.json({ readiness: 'research_only', executionEnabled: false, opportunities: [] })),
  http.get('/api/alice-invest/fixed-income/shadow-validation', () => HttpResponse.json({
    state: 'collecting', distinctObservationDays: 0, observationCount: 0, period: { from: null, to: null },
    metrics: { staleDataEvents: 0, providerFailures: 0, alerts: 0, duplicateAlerts: 0, reviewedAlerts: 0, falsePositives: 0, falsePositiveRatePct: '0.00000000' },
    blockers: ['minimum_30_distinct_days_not_met', 'human_walkthrough_missing'], walkthrough: null, readiness: 'research_only', canEnableRecommendations: false,
  })),
  http.get('/api/alice-invest/fixed-income/health', () => HttpResponse.json({
    state: 'collecting', readiness: 'research_only', executionEnabled: false, checkedAt: '2026-08-20T12:00:00.000Z',
    monitor: { enabled: false, notificationsEnabled: false, lastEvent: null, circuitState: 'no_recent_open_event' },
    operations: { auditEvents: 1, deliveries: 0, manualOutcomes: 1 },
  })),
  http.get('/api/alice-invest/fixed-income/credit-sources/cvm', () => HttpResponse.json({
    readiness: 'research_only', executionEnabled: false,
    snapshot: { observedAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-28T12:00:00.000Z', quality: { score: 100, confidence: 95, criticalFieldsMissing: [] }, payload: { year: '2026', statements: [{ kind: 'ITR', company: 'Companhia Exemplo', referenceDate: '2026-06-30', statement: 'DRE', accountCode: '3.11', account: 'Lucro líquido', value: '1234.56' }], events: [{ company: 'Companhia Exemplo', referenceDate: '2026-08-10', category: 'Fato Relevante', type: 'Comunicado', subject: 'Evento documentado' }] }, provenance: [{ publisher: 'Comissão de Valores Mobiliários', sourceUrl: 'https://dados.cvm.gov.br/dfp.zip', dataAsOf: '2026-08-10', retrievedAt: '2026-08-20T12:00:00.000Z', rawPayloadChecksum: 'a'.repeat(64) }, { publisher: 'Comissão de Valores Mobiliários', sourceUrl: 'https://dados.cvm.gov.br/itr.zip', dataAsOf: '2026-08-10', retrievedAt: '2026-08-20T12:00:00.000Z', rawPayloadChecksum: 'b'.repeat(64) }, { publisher: 'Comissão de Valores Mobiliários', sourceUrl: 'https://dados.cvm.gov.br/ipe.zip', dataAsOf: '2026-08-10', retrievedAt: '2026-08-20T12:00:00.000Z', rawPayloadChecksum: 'c'.repeat(64) }] },
  })),
  http.post('/api/alice-invest/fixed-income/credit-documents/inspect', async ({ request }) => {
    const body = await request.json() as { fileName?: string; contentType?: string; contentBase64?: string }
    const pdf = body.contentType === 'application/pdf'
    return HttpResponse.json({ readiness: 'research_only', executionEnabled: false, persisted: false, document: { fileName: body.fileName ?? 'evidence', contentType: body.contentType ?? 'text/plain', byteLength: Math.floor((body.contentBase64?.length ?? 0) * 0.75), documentHash: 'd'.repeat(64), extractionState: 'text_extracted', extractedText: 'Conteúdo documental sintético para demonstração.', ...(pdf ? { pageCount: 1, pages: [{ page: 1, startOffset: 0, endOffset: 47 }] } : {}), trust: 'untrusted_document_content', securitySignals: [] } })
  }),
  http.post('/api/alice-invest/fixed-income/credit-analysis', () => HttpResponse.json({
    readiness: 'research_only', actionable: false, assetId: 'debenture:companhia-exemplo', deterministicScore: 63, decision: 'insufficient_data', adjustedNetPremiumRangePct: { low: '-0.5', high: '1' }, reasonCodes: ['liquidity_score_missing'], evidence: [{ id: 'uploaded-document', documentType: 'reviewed_document', documentHash: 'd'.repeat(64), locator: 'text:0' }], calculationTraceId: 'e'.repeat(64), methodologyId: 'private-credit-analysis@1',
  })),
]
