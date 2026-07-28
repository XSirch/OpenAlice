import type { CorporateEvent } from './contracts.js'

export interface PortfolioInstrument { symbol: string; quantity: string }
export interface InstrumentAlias { from: string; to: string; sourceUrl: string }
export interface CorporateEventAssociation { eventId: string; eventInstrument: string; positionSymbol: string | null; confidence: 'exact' | 'mapped' | 'review_required'; reason: string; sourceUrl: string }

/**
 * Read-only matching. A published event never changes custody or average cost;
 * an old ticker needs an explicit, sourced alias and ambiguous matches stay in
 * review_required.
 */
export function associateCorporateEvents(events: readonly CorporateEvent[], positions: readonly PortfolioInstrument[], aliases: readonly InstrumentAlias[] = []): CorporateEventAssociation[] {
  const active = new Set(positions.filter((position) => Number(position.quantity) > 0).map((position) => position.symbol.toUpperCase()))
  const aliasesByFrom = new Map(aliases.map((alias) => [alias.from.toUpperCase(), alias]))
  return events.map((event) => {
    if (active.has(event.instrument)) return { eventId: event.id, eventInstrument: event.instrument, positionSymbol: event.instrument, confidence: 'exact', reason: 'Event instrument matches an active portfolio position.', sourceUrl: event.source.url }
    const alias = aliasesByFrom.get(event.instrument)
    if (alias && active.has(alias.to.toUpperCase())) return { eventId: event.id, eventInstrument: event.instrument, positionSymbol: alias.to.toUpperCase(), confidence: 'mapped', reason: 'Mapped through an explicit sourced instrument alias.', sourceUrl: alias.sourceUrl }
    return { eventId: event.id, eventInstrument: event.instrument, positionSymbol: null, confidence: 'review_required', reason: 'No exact active position or explicit sourced instrument alias exists.', sourceUrl: event.source.url }
  })
}
