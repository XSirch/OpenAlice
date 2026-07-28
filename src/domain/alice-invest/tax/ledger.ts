import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/)

export const brokerageOperationSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceName: z.string().min(1).max(256),
  sourceRow: z.number().int().positive(),
  market: z.literal('B3'),
  symbol: z.string().toUpperCase().regex(/^[A-Z]{4}\d{1,2}[A-Z]?$/),
  side: z.enum(['buy', 'sell']),
  tradeDate: dateOnly,
  quantity: decimalString.refine((value) => new Decimal(value).gt(0)),
  unitPriceBRL: decimalString,
  feesBRL: decimalString.default('0'),
  taxesBRL: decimalString.default('0'),
}).strict()
export type BrokerageOperation = z.infer<typeof brokerageOperationSchema>

export const brokerageLedgerSchema = z.object({
  version: z.literal(1),
  importedSourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10_000),
  entries: z.array(brokerageOperationSchema).max(200_000),
}).strict()
export type BrokerageLedger = z.infer<typeof brokerageLedgerSchema>
export const emptyBrokerageLedger: BrokerageLedger = { version: 1, importedSourceHashes: [], entries: [] }

export interface BrokerageImportPreview { sourceHash: string; sourceName: string; operations: BrokerageOperation[]; errors: Array<{ row: number; message: string }> }

/**
 * Parses the documented B3-like CSV shape only. Delimiters may be semicolon
 * or comma; headers are matched by normalized Portuguese aliases. A PDF or an
 * unknown broker export is rejected rather than being guessed.
 */
export function previewB3BrokerageCsv(sourceName: string, content: string): BrokerageImportPreview {
  if (!/\.csv$/i.test(sourceName)) throw new Error('Only UTF-8 CSV brokerage-note exports are supported for import preview.')
  if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) throw new Error('Brokerage-note CSV exceeds the 5 MiB import limit.')
  const sourceHash = sha256(content)
  const rows = parseCsv(content)
  const [header, ...body] = rows
  if (!header) throw new Error('Brokerage-note CSV is empty.')
  const columns = header.map(normalizeHeader)
  const required = { date: find(columns, ['data negocio', 'data negociacao', 'data']), side: find(columns, ['c v', 'operacao', 'tipo']), symbol: find(columns, ['codigo de negociacao', 'codigo negociacao', 'codigo', 'ativo']), quantity: find(columns, ['quantidade', 'qtd']), price: find(columns, ['preco', 'preco unitario']) }
  if (Object.values(required).some((value) => value === -1)) throw new Error('CSV must include data, C/V (or operação), código, quantidade and preço columns.')
  const fees = indexes(columns, ['taxa liquidacao', 'taxa registro', 'emolumentos', 'taxas', 'corretagem'])
  const taxes = indexes(columns, ['irrf', 'imposto'])
  const operations: BrokerageOperation[] = []
  const errors: BrokerageImportPreview['errors'] = []
  body.forEach((row, index) => {
    const rowNumber = index + 2
    if (row.every((cell) => !cell.trim())) return
    try {
      const side = sideOf(row[required.side] ?? '')
      const symbol = (row[required.symbol] ?? '').trim().toUpperCase().replace(/\.SA$/, '')
      const operation = brokerageOperationSchema.parse({
        id: sha256(`${sourceHash}|${rowNumber}|${row.join('|')}`), sourceHash, sourceName, sourceRow: rowNumber, market: 'B3', symbol, side,
        tradeDate: brazilDate(row[required.date] ?? ''), quantity: brazilDecimal(row[required.quantity] ?? ''), unitPriceBRL: brazilDecimal(row[required.price] ?? ''),
        feesBRL: sum(row, fees), taxesBRL: sum(row, taxes),
      })
      operations.push(operation)
    } catch (error) { errors.push({ row: rowNumber, message: error instanceof Error ? error.message : String(error) }) }
  })
  return { sourceHash, sourceName, operations, errors }
}

export function confirmBrokerageImport(ledger: BrokerageLedger, preview: BrokerageImportPreview): BrokerageLedger {
  const current = brokerageLedgerSchema.parse(ledger)
  if (preview.errors.length) throw new Error('Cannot confirm a preview containing invalid rows.')
  if (!preview.operations.length) throw new Error('Cannot confirm a preview with no operations.')
  if (current.importedSourceHashes.includes(preview.sourceHash)) throw new Error('This brokerage-note file was already imported.')
  const existing = new Set(current.entries.map((entry) => entry.id))
  if (preview.operations.some((operation) => existing.has(operation.id))) throw new Error('A brokerage operation from this preview already exists.')
  return brokerageLedgerSchema.parse({ ...current, importedSourceHashes: [...current.importedSourceHashes, preview.sourceHash], entries: [...current.entries, ...preview.operations] })
}

export interface AveragePricePosition { symbol: string; quantity: string; averagePriceBRL: string; costBasisBRL: string; realizedPnlBRL: string }

/** Average-cost ledger for a single B3 market. Selling more than held fails closed. */
export function calculateAveragePrices(entries: readonly BrokerageOperation[]): AveragePricePosition[] {
  const positions = new Map<string, { quantity: Decimal; cost: Decimal; realized: Decimal }>()
  for (const entry of [...entries].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id))) {
    const operation = brokerageOperationSchema.parse(entry)
    const position = positions.get(operation.symbol) ?? { quantity: new Decimal(0), cost: new Decimal(0), realized: new Decimal(0) }
    const quantity = new Decimal(operation.quantity)
    const gross = quantity.mul(operation.unitPriceBRL)
    const costs = new Decimal(operation.feesBRL).plus(operation.taxesBRL)
    if (operation.side === 'buy') { position.quantity = position.quantity.plus(quantity); position.cost = position.cost.plus(gross).plus(costs) }
    else {
      if (position.quantity.lt(quantity)) throw new Error(`Cannot calculate average price: ${operation.symbol} sell exceeds recorded quantity.`)
      const average = position.quantity.isZero() ? new Decimal(0) : position.cost.div(position.quantity)
      position.quantity = position.quantity.minus(quantity)
      position.cost = position.cost.minus(average.mul(quantity))
      position.realized = position.realized.plus(gross.minus(costs).minus(average.mul(quantity)))
    }
    positions.set(operation.symbol, position)
  }
  return [...positions.entries()].map(([symbol, position]) => ({ symbol, quantity: position.quantity.toFixed(), averagePriceBRL: position.quantity.isZero() ? '0' : position.cost.div(position.quantity).toFixed(8), costBasisBRL: position.cost.toFixed(8), realizedPnlBRL: position.realized.toFixed(8) })).sort((a, b) => a.symbol.localeCompare(b.symbol))
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
function normalizeHeader(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function find(columns: string[], aliases: string[]): number { return columns.findIndex((column) => aliases.includes(column)) }
function indexes(columns: string[], aliases: string[]): number[] { return columns.flatMap((column, index) => aliases.includes(column) ? [index] : []) }
function sideOf(value: string): 'buy' | 'sell' { const normalized = normalizeHeader(value); if (['c', 'compra', 'buy'].includes(normalized)) return 'buy'; if (['v', 'venda', 'sell'].includes(normalized)) return 'sell'; throw new Error(`Unsupported operation side: ${value}`) }
function brazilDate(value: string): string { const trimmed = value.trim(); const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed); return br ? `${br[3]}-${br[2]}-${br[1]}` : dateOnly.parse(trimmed) }
function brazilDecimal(value: string): string { const trimmed = value.trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.'); return decimalString.parse(trimmed) }
function sum(row: string[], positions: number[]): string { return positions.reduce((total, index) => total.plus(brazilDecimal(row[index] || '0')), new Decimal(0)).toFixed() }
function parseCsv(content: string): string[][] { const delimiter = content.includes(';') ? ';' : ','; const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; for (let i = 0; i < content.length; i += 1) { const char = content[i]!; if (char === '"') { if (quoted && content[i + 1] === '"') { cell += char; i += 1 } else quoted = !quoted } else if (char === delimiter && !quoted) { row.push(cell); cell = '' } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && content[i + 1] === '\n') i += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = '' } else cell += char } if (cell.length || row.length) { row.push(cell); rows.push(row) } return rows }
