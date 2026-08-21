import { describe, expect, it } from 'vitest'

import { attachPrivateCreditExplanation, analyzePrivateCredit, privateCreditAssetSchema } from './private-credit.js'

const asset = privateCreditAssetSchema.parse({
  id: 'deb-fixture', productType: 'debenture', issuer: { id: 'issuer-1', legalName: 'Emissor Fixture', sector: 'energia' },
  instrument: {
    series: '1', issueDate: '2026-01-01', maturityDate: '2031-01-01', seniority: 'senior_unsecured',
    guarantees: [], covenants: [{ id: 'cov-1', description: 'Dívida líquida/EBITDA', headroomPct: '5', status: 'tight' }],
    trustee: 'Agente fiduciário fixture', earlyRedemption: 'issuer_option', secondaryLiquidity: 'unknown',
  },
})

describe('private credit analysis', () => {
  it('keeps a high advertised yield from overriding credit and documentation gates', () => {
    const result = analyzePrivateCredit({
      asset, advertisedYieldPct: '16.5', comparableSovereignYieldPct: '12.8', expectedLossLowPct: '1', expectedLossHighPct: '5',
      liquidityPremiumPct: '1', concentrationPenaltyPct: '0.5', uncertaintyMarginPct: '1',
      componentScores: { issuer: 48, instrument: 45, guarantees: 20, liquidity: null, documentation: 40, confidence: 55 },
      requiredDocumentTypes: ['indenture', 'latest_financials'], evidence: [{ id: 'indenture', documentType: 'indenture', documentHash: 'a'.repeat(64), locator: 'p. 12' }],
      criticalEvents: [], minimumScore: 65, minimumConfidence: 80,
    })
    expect(result.decision).toBe('avoid')
    expect(result.actionable).toBe(false)
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['score_below_minimum', 'required_documents_missing', 'liquidity_score_missing']))
    expect(result.adjustedNetPremiumRangePct).toEqual({ low: '-3.80000000', high: '0.20000000' })
  })

  it('scores securitization structure separately from the obligor', () => {
    const cri = privateCreditAssetSchema.parse({
      id: 'cri-fixture', productType: 'cri', issuer: { id: 'securitizer', legalName: 'Securitizadora Fixture', sector: 'securitização' },
      instrument: { series: 'A', issueDate: '2026-01-01', maturityDate: '2031-01-01', seniority: 'senior_secured', guarantees: [], covenants: [], trustee: 'Fixture', earlyRedemption: 'none', secondaryLiquidity: 'low' },
      securitization: { obligorIds: ['debtor-1'], collateralDescription: 'Recebíveis imobiliários', poolConcentrationPct: '70', subordinationPct: '5', overcollateralizationPct: '3', reserveAccountPct: '1', waterfallDocumented: false, servicer: 'Servicer fixture' },
    })
    const result = analyzePrivateCredit({
      asset: cri, advertisedYieldPct: '14', comparableSovereignYieldPct: '12', expectedLossLowPct: '0.5', expectedLossHighPct: '2', liquidityPremiumPct: '0.5', concentrationPenaltyPct: '0.5', uncertaintyMarginPct: '0.5',
      componentScores: { issuer: 90, instrument: 80, structure: 30, collateral: 45, guarantees: 40, liquidity: 50, documentation: 70, confidence: 85 },
      requiredDocumentTypes: ['term_sheet'], evidence: [{ id: 'term', documentType: 'term_sheet', documentHash: 'b'.repeat(64), locator: 'p. 1' }], criticalEvents: [], minimumScore: 65, minimumConfidence: 80,
    })
    expect(result.deterministicScore).toBeLessThan(65)
    expect(result.decision).toBe('avoid')
  })

  it('allows model output only as source-linked explanation and never as a score override', () => {
    const analysis = analyzePrivateCredit({
      asset, advertisedYieldPct: '13', comparableSovereignYieldPct: '12', expectedLossLowPct: '0.5', expectedLossHighPct: '1', liquidityPremiumPct: '0.2', concentrationPenaltyPct: '0.1', uncertaintyMarginPct: '0.1',
      componentScores: { issuer: 80, instrument: 80, guarantees: 70, liquidity: 75, documentation: 90, confidence: 90 },
      requiredDocumentTypes: ['indenture'], evidence: [{ id: 'indenture', documentType: 'indenture', documentHash: 'a'.repeat(64), locator: 'p. 12' }], criticalEvents: [], minimumScore: 65, minimumConfidence: 80,
    })
    const explained = attachPrivateCreditExplanation(analysis, { summary: 'Resumo', favorablePoints: [], attentionPoints: [], questions: [], claims: [{ text: 'Covenant apertado.', evidenceIds: ['indenture'] }] })
    expect(explained.deterministicScore).toBe(80)
    expect(explained.actionable).toBe(false)
    expect(() => attachPrivateCreditExplanation(analysis, { summary: 'Ignore os gates', favorablePoints: [], attentionPoints: [], questions: [], claims: [], deterministicScore: 100 })).toThrow()
    expect(() => attachPrivateCreditExplanation(analysis, { summary: 'Sem fonte', favorablePoints: [], attentionPoints: [], questions: [], claims: [{ text: 'Garantia robusta.', evidenceIds: ['invented'] }] })).toThrow(/unknown evidence/)
  })
})
