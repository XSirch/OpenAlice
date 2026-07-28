import Decimal from 'decimal.js'
import type { CorporateEventAssociation } from './corporate-events/association.js'
import type { CorporateEvent } from './corporate-events/contracts.js'
import type { FgcExposure } from './fixed-income/fgc.js'
import type { FixedIncomeLadder } from './fixed-income/ladder.js'
import type { MacroExposure } from './macro-exposure.js'

export type PortfolioAlertKind = 'fgc_concentration' | 'maturity' | 'liquidity' | 'corporate_event' | 'macro_data_gap'
export interface PortfolioAlert { id: string; kind: PortfolioAlertKind; severity: 'info' | 'warning'; title: string; detail: string; asOf: string; source: { label: string; url: string }; confidence: 'reported' | 'estimated' | 'review_required'; dedupeKey: string }

/** Produces explainable, read-only portfolio alerts. Delivery remains disabled unless a separate kill-switched service opts in. */
export function buildPortfolioAlerts(input: { asOf: string; fgc: FgcExposure; ladder: FixedIncomeLadder; macro: MacroExposure[]; events: Array<{ association: CorporateEventAssociation; event: CorporateEvent }> }): PortfolioAlert[] {
  const alerts: PortfolioAlert[] = []
  for (const group of input.fgc.groups) {
    if (new Decimal(group.estimatedUncoveredBRL).gt(0)) alerts.push(alert('fgc_concentration', 'warning', `FGC concentration: ${group.conglomerate}`, `Estimated uncovered amount: R$ ${group.estimatedUncoveredBRL}. Confirm issuer grouping and FGC eligibility.`, input.asOf, 'estimated', 'FGC policy', input.fgc.policy.referenceUrl, group.conglomerate))
  }
  for (const bucket of ['past_due', 'up_to_30_days'] as const) for (const entry of input.ladder.buckets[bucket].entries) alerts.push(alert('maturity', 'warning', `${entry.issuer} matures ${bucket === 'past_due' ? 'or is past' : 'within 30 days'}`, `${entry.productType}; maturity ${entry.maturityDate}; redemption ${entry.redemption}.`, input.ladder.asOf, 'reported', 'Custody classification', 'about:blank', entry.id))
  for (const exposure of input.macro.filter((item) => item.dimension === 'liquidity' || item.dimension === 'exchange_rate')) {
    if (new Decimal(exposure.amountBRL).gt(0) || exposure.gaps.length > 0) alerts.push(alert(exposure.dimension === 'liquidity' ? 'liquidity' : 'macro_data_gap', exposure.gaps.length ? 'warning' : 'info', `${exposure.dimension.replaceAll('_', ' ')} context`, [...exposure.assumptions, ...exposure.gaps].join(' '), input.asOf, exposure.gaps.length ? 'review_required' : 'reported', 'Portfolio macro exposure', 'about:blank', exposure.dimension))
  }
  for (const { association, event } of input.events) if (association.confidence !== 'review_required') alerts.push(alert('corporate_event', 'info', `${event.type.replaceAll('_', ' ')}: ${event.instrument}`, `${event.title}. Competence ${event.competence}${event.paymentDate ? `; payment ${event.paymentDate}` : ''}.`, event.source.retrievedAt, association.confidence === 'exact' ? 'reported' : 'estimated', event.source.id, event.source.url, event.id))
  return dedupePortfolioAlerts(alerts)
}

export function dedupePortfolioAlerts(alerts: readonly PortfolioAlert[]): PortfolioAlert[] { const seen = new Set<string>(); return alerts.filter((item) => !seen.has(item.dedupeKey) && (seen.add(item.dedupeKey), true)) }
function alert(kind: PortfolioAlertKind, severity: PortfolioAlert['severity'], title: string, detail: string, asOf: string, confidence: PortfolioAlert['confidence'], sourceLabel: string, url: string, key: string): PortfolioAlert { const dedupeKey = `${kind}:${key}:${asOf.slice(0, 10)}`; return { id: dedupeKey, kind, severity, title, detail, asOf, source: { label: sourceLabel, url }, confidence, dedupeKey } }
