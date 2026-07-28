import { describe, expect, it } from 'vitest'
import { buildTaxReport, taxReportCsv, taxReportPdf } from './report.js'
import type { BrokerageLedger } from './ledger.js'
const entry = { id: 'a'.repeat(64), sourceHash: 'b'.repeat(64), sourceName: 'nota-pessoal.csv', sourceRow: 2, market: 'B3' as const, symbol: 'PETR4', side: 'buy' as const, tradeDate: '2026-01-02', quantity: '10', unitPriceBRL: '30', feesBRL: '1', taxesBRL: '0' }
const ledger: BrokerageLedger = { version: 1, importedSourceHashes: [entry.sourceHash], entries: [entry] }
describe('tax report export', () => {
  it('redacts origin identifiers by default and retains reconciliation fields', () => { const report = buildTaxReport(ledger, { from: '2026-01-01', to: '2026-01-31' }, '2026-02-01T00:00:00.000Z'); expect(report.rows[0]).toMatchObject({ symbol: 'PETR4', source: 'no•••#2 (bbbbbbbb…)' }); expect(taxReportCsv(report)).not.toContain('nota-pessoal.csv') })
  it('creates a downloadable PDF with the disclaimer and no executable payload', () => { const report = buildTaxReport(ledger, { from: '2026-01-01', to: '2026-01-31' }); const pdf = taxReportPdf(report); expect(Buffer.from(pdf).subarray(0, 8).toString()).toBe('%PDF-1.4'); expect(Buffer.from(pdf).toString('latin1')).toContain('Nao constitui aconselhamento') })
})
