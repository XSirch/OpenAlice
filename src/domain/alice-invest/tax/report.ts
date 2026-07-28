import type { BrokerageLedger, BrokerageOperation } from './ledger.js'

export interface TaxReportOptions { from: string; to: string; includeIdentifiers?: boolean }
export interface TaxReport { from: string; to: string; generatedAt: string; warnings: string[]; rows: Array<Pick<BrokerageOperation, 'tradeDate' | 'market' | 'symbol' | 'side' | 'quantity' | 'unitPriceBRL' | 'feesBRL' | 'taxesBRL'> & { source: string }> }

/** A reconciliation artifact, not a declaration or payment instruction. */
export function buildTaxReport(ledger: BrokerageLedger, options: TaxReportOptions, generatedAt = new Date().toISOString()): TaxReport {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to) || options.from > options.to) throw new Error('A valid inclusive ISO period is required.')
  return {
    from: options.from, to: options.to, generatedAt,
    warnings: ['Estimativa informativa para conferência. Não constitui aconselhamento tributário, declaração, DARF ou pagamento.', 'Operações e fontes devem ser reconciliadas com as notas e a custódia originais.', 'O relatório não compensa prejuízos nem confirma retenções.'],
    rows: ledger.entries.filter((entry) => entry.tradeDate >= options.from && entry.tradeDate <= options.to).map((entry) => ({
      tradeDate: entry.tradeDate, market: entry.market, symbol: entry.symbol, side: entry.side, quantity: entry.quantity, unitPriceBRL: entry.unitPriceBRL, feesBRL: entry.feesBRL, taxesBRL: entry.taxesBRL,
      source: options.includeIdentifiers ? `${entry.sourceName}#${entry.sourceRow} (${entry.sourceHash})` : `${mask(entry.sourceName)}#${entry.sourceRow} (${entry.sourceHash.slice(0, 8)}…)`,
    })),
  }
}

export function taxReportCsv(report: TaxReport): string {
  const header = ['trade_date', 'market', 'symbol', 'side', 'quantity', 'unit_price_brl', 'fees_brl', 'taxes_brl', 'source']
  const lines = [header, ...report.rows.map((row) => [row.tradeDate, row.market, row.symbol, row.side, row.quantity, row.unitPriceBRL, row.feesBRL, row.taxesBRL, row.source])]
  return `${lines.map((line) => line.map(csv).join(',')).join('\r\n')}\r\n`
}

/** Minimal self-contained PDF: no browser, remote font or executable content. */
export function taxReportPdf(report: TaxReport): Uint8Array {
  const lines = ['Alice Invest — relatório tributário para conferência', `Período: ${report.from} a ${report.to}`, `Gerado: ${report.generatedAt}`, ...report.warnings.map((warning) => `AVISO: ${warning}`), ...report.rows.map((row) => `${row.tradeDate} ${row.symbol} ${row.side} qtd ${row.quantity} preço R$ ${row.unitPriceBRL} fonte ${row.source}`)].slice(0, 44)
  const content = `BT /F1 9 Tf 48 790 Td 12 TL ${lines.map((line, index) => `${index ? 'T* ' : ''}(${pdf(line)}) Tj`).join('\n')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ]
  let output = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, 'latin1')); output += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(output, 'latin1'); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(output, 'latin1')
}

function mask(value: string): string { return value.length <= 2 ? '•••' : `${value.slice(0, 2)}•••` }
function csv(value: string): string { return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value }
function pdf(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&') }
