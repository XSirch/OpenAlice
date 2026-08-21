import { describe, expect, it } from 'vitest'

import type { FixedIncomeSourceProvenance } from './providers/provider-contract.js'
import { rankFixedIncomeOpportunities } from './opportunity-ranking.js'

const source: FixedIncomeSourceProvenance = {
  publisher: 'User fixture', sourceId: 'offer-fixture', sourceUrl: 'https://openalice.local/manual-import/offers.json',
  decision: 'manual', access: 'user_supplied', method: 'manual_upload', parameters: {}, license: 'user_supplied',
  termsReviewedAt: '2026-08-20', termsVersion: 'fixture@1', retrievedAt: '2026-08-20T12:00:00.000Z',
  dataAsOf: '2026-08-20T12:00:00.000Z', rawPayloadChecksum: 'a'.repeat(64), parserVersion: 'fixture@1', originalIdentifiers: {},
}
const opportunity = (id: string, productType: 'cdb' | 'lca', annualRatePct: string, validUntil = '2026-08-20T12:30:00.000Z') => ({
  id,
  product: {
    productType, issuer: { legalName: `Banco ${id}`, conglomerate: `Grupo ${id}` }, rate: { kind: 'fixed' as const, annualRatePct },
    issueDate: '2026-08-20', maturityDate: '2027-08-20', liquidity: { redemption: 'at_maturity' as const, settlementBusinessDays: 1 },
    fgc: { status: 'eligible' as const },
  },
  observedAt: '2026-08-20T12:00:00.000Z', validUntil, minimumBRL: '1000', maximumAvailableBRL: '50000',
  rate: { kind: 'fixed' as const, annualRatePct }, liquidity: { redemption: 'at_maturity' as const, settlementBusinessDays: 1 },
  availability: 'confirmed' as const, distributor: 'BTG_PACTUAL' as const, origin: 'USER_IMPORT' as const,
  confirmation: { kind: 'offer_sent_by_user' as const, confirmedAt: '2026-08-20T12:00:00.000Z' },
})
const risk = (institutionCode: string, intrinsicCreditScore: number) => ({
  institutionCode, referencePeriod: '202603', intrinsicCreditScore, liquidityScore: 80, regulatoryScore: 100,
  fgcProtectionScore: 100, dataConfidenceScore: 95, gaps: [], methodologyId: 'ifdata-bank-risk@1' as const,
})

describe('fixed-income opportunity ranking', () => {
  it('selects the higher net risk-adjusted result and explains rejected alternatives', () => {
    const result = rankFixedIncomeOpportunities({
      contributionDate: '2026-08-20', targetDate: '2027-08-20', now: '2026-08-20T12:05:00.000Z',
      contributionBRL: '50000', portfolioTotalAfterContributionBRL: '2050000', liquidReserveAfterContributionBRL: '500000',
      calendarDays: 365, businessDays: 252, annualCdiPct: '12', annualInflationPct: '4',
      policy: { liquidityReservePct: '20', minimumCreditScore: 65, minimumConfidenceScore: 80, riskPenaltyPct: '1', liquidityPenaltyPct: '0.25' },
      candidates: [
        { opportunity: opportunity('lca', 'lca', '10.5'), source, bankRisk: risk('lca', 82), existingConglomerateExposureBRL: '0', conglomerateStatus: 'confirmed' },
        { opportunity: opportunity('cdb', 'cdb', '12'), source, bankRisk: risk('cdb', 80), existingConglomerateExposureBRL: '0', conglomerateStatus: 'confirmed' },
        { opportunity: opportunity('weak', 'cdb', '16.5'), source, bankRisk: risk('weak', 48), existingConglomerateExposureBRL: '0', conglomerateStatus: 'confirmed' },
      ],
    })
    expect(result.bestAlternative?.opportunityId).toBe('lca')
    expect(result.bestAlternative?.projectedNetBRL).toBe('55250.00')
    expect(result.rejectedAlternatives).toEqual(expect.arrayContaining([expect.objectContaining({ opportunityId: 'weak', reasons: expect.arrayContaining(['credit_score_below_minimum']) })]))
    expect(result.maintenance).toMatchObject({ projectedNetBRL: '50000.00' })
    expect(result.calculationTraceId).toMatch(/^[a-f0-9]{64}$/)
    expect(result.actionable).toBe(false)
  })

  it('fails all allocations when reserve or current availability is invalid', () => {
    const result = rankFixedIncomeOpportunities({
      contributionDate: '2026-08-20', targetDate: '2027-08-20', now: '2026-08-20T13:00:00.000Z',
      contributionBRL: '50000', portfolioTotalAfterContributionBRL: '2050000', liquidReserveAfterContributionBRL: '300000',
      calendarDays: 365, businessDays: 252, annualCdiPct: '12', annualInflationPct: '4',
      policy: { liquidityReservePct: '20', minimumCreditScore: 65, minimumConfidenceScore: 80, riskPenaltyPct: '1', liquidityPenaltyPct: '0.25' },
      candidates: [{ opportunity: opportunity('expired', 'lca', '20'), source, bankRisk: risk('expired', 90), existingConglomerateExposureBRL: '0', conglomerateStatus: 'confirmed' }],
    })
    expect(result.bestAlternative).toBeNull()
    expect(result.rejectedAlternatives[0]?.reasons).toEqual(expect.arrayContaining(['liquidity_reserve_below_minimum', 'offer_expired']))
  })
})
