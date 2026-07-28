import { describe, expect, it } from 'vitest'
import { calculateAveragePrices, confirmBrokerageImport, emptyBrokerageLedger, previewB3BrokerageCsv } from './ledger.js'

describe('B3 brokerage-note ledger', () => {
  const csv = 'Data Negócio;C/V;Código de Negociação;Quantidade;Preço;Emolumentos;IRRF\n02/01/2026;C;PETR4;10;30,00;1,00;0\n03/01/2026;V;PETR4;4;35,00;0,50;0,10\n'
  it('previews an anonymized B3-like CSV and persists only after explicit confirmation', () => {
    const preview = previewB3BrokerageCsv('nota-b3.csv', csv)
    expect(preview.errors).toEqual([])
    expect(preview.operations).toHaveLength(2)
    expect(() => confirmBrokerageImport(emptyBrokerageLedger, { ...preview, errors: [{ row: 2, message: 'bad' }] })).toThrow(/Cannot confirm/)
    const ledger = confirmBrokerageImport(emptyBrokerageLedger, preview)
    expect(() => confirmBrokerageImport(ledger, preview)).toThrow(/already imported/)
  })
  it('uses Decimal average cost, carrying buy costs and realized sale costs', () => {
    const operations = previewB3BrokerageCsv('nota-b3.csv', csv).operations
    expect(calculateAveragePrices(operations)).toEqual([expect.objectContaining({ symbol: 'PETR4', quantity: '6', averagePriceBRL: '30.10000000', costBasisBRL: '180.60000000', realizedPnlBRL: '19.00000000' })])
  })
  it('rejects unsupported documents rather than parsing a PDF as a note', () => expect(() => previewB3BrokerageCsv('nota.pdf', '%PDF')).toThrow(/Only UTF-8 CSV/))
})
