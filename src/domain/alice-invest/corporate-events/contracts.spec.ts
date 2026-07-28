import { describe, expect, it } from 'vitest'
import { createCorporateEvent, dedupeCorporateEvents, normalizeBrapiCashDividends, normalizeCvmIpeCorporateEvent } from './contracts.js'

describe('Brazilian corporate events', () => {
  it('normalizes a sourced BRAPI cash event without inventing an ex-date', () => {
    const events = normalizeBrapiCashDividends({ issuer: 'CVM:009512', instrument: 'PETR4', retrievedAt: '2026-07-28T15:00:00.000Z', events: [{ rate: 0.5, lastDatePrior: '2026-05-01', paymentDate: '2026-06-01' }] })
    expect(events).toEqual([expect.objectContaining({ instrument: 'PETR4', type: 'dividend', competence: '2026-05-01', dateCom: '2026-05-01', paymentDate: '2026-06-01', cashAmountPerUnitBRL: '0.5', source: expect.objectContaining({ id: 'brapi', license: 'provider_terms' }) })])
    expect(events[0]?.exDate).toBeUndefined()
  })

  it('accepts an explicit CVM material fact but does not guess a split from another IPE subject', () => {
    const base = { issuerCvmCode: '009512', instrument: 'PETR4', referenceDate: '2026-06-01', filedAt: '2026-06-02', type: 'Fato Relevante', subject: 'Evento divulgado', revision: '2', downloadUrl: 'https://www.rad.cvm.gov.br/document', retrievedAt: '2026-06-02T10:00:00.000Z' }
    expect(normalizeCvmIpeCorporateEvent({ ...base, category: 'Fato Relevante' })).toMatchObject({ type: 'material_fact', revision: '2', source: { id: 'cvm', license: 'official_public' } })
    expect(normalizeCvmIpeCorporateEvent({ ...base, category: 'Aviso aos Acionistas', subject: 'Desdobramento' })).toBeNull()
  })

  it('dedupes only the same issuer/instrument/type/competence/revision and retains a revised publication', () => {
    const base = createCorporateEvent({ issuer: 'CVM:009512', instrument: 'PETR4', type: 'dividend', competence: '2026-05-01', revision: 'v1', status: 'confirmed', cashAmountPerUnitBRL: '0.5', title: 'Dividend', source: { id: 'cvm', url: 'https://dados.cvm.gov.br/', license: 'official_public', retrievedAt: '2026-05-01T00:00:00.000Z' } })
    const duplicate = { ...base, source: { ...base.source, retrievedAt: '2026-05-02T00:00:00.000Z' } }
    const { id: _id, ...baseDraft } = base
    const revised = createCorporateEvent({ ...baseDraft, revision: 'v2', status: 'revised', source: { ...base.source, retrievedAt: '2026-05-03T00:00:00.000Z' } })
    const result = dedupeCorporateEvents([base, duplicate, revised])
    expect(result).toHaveLength(2)
    expect(result.find((event) => event.revision === 'v1')?.source.retrievedAt).toBe('2026-05-02T00:00:00.000Z')
  })
})
