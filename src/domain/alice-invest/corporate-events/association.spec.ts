import { describe, expect, it } from 'vitest'
import { createCorporateEvent } from './contracts.js'
import { associateCorporateEvents } from './association.js'
const event = createCorporateEvent({ issuer: 'CVM:1', instrument: 'PETR4', type: 'dividend', competence: '2026-01-01', revision: '1', status: 'confirmed', cashAmountPerUnitBRL: '1', title: 'Dividend', source: { id: 'cvm', url: 'https://example.test/cvm', license: 'official_public', retrievedAt: '2026-01-01T00:00:00.000Z' } })
describe('corporate event association', () => {
  it('uses an exact active instrument without mutating the position', () => expect(associateCorporateEvents([event], [{ symbol: 'PETR4', quantity: '10' }])).toMatchObject([{ positionSymbol: 'PETR4', confidence: 'exact' }]))
  it('maps old symbols only through an explicit source and keeps unresolved events for review', () => { const { id: _id, ...draft } = event; const old = createCorporateEvent({ ...draft, instrument: 'OLD4' }); expect(associateCorporateEvents([old], [{ symbol: 'PETR4', quantity: '10' }], [{ from: 'OLD4', to: 'PETR4', sourceUrl: 'https://example.test/notice' }])[0]).toMatchObject({ positionSymbol: 'PETR4', confidence: 'mapped' }); expect(associateCorporateEvents([event], [{ symbol: 'PETR4', quantity: '0' }])[0]).toMatchObject({ confidence: 'review_required' }) })
})
