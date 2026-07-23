const PLUGGY_API_URL = 'https://api.pluggy.ai'

export interface PluggyCredentials {
  clientId: string
  clientSecret: string
}

export interface CustodyPosition {
  id: string
  name: string
  code?: string
  type?: string
  quantity?: number
  /** Current net position value, after fees and taxes when supplied by the institution. */
  value?: number
  /** Amount originally invested, as reported by the institution. */
  originalAmount?: number
  /** Accumulated return reported by the institution, including its fees/taxes when available. */
  profit?: number
  /** Date of the earliest application transaction, when Pluggy provides it. */
  acquiredAt?: string
  /** Whether the invested amount was reported directly or reconstructed from transactions. */
  costBasisSource?: 'reported' | 'transactions'
  grossAmount?: number
  unitValue?: number
  currency: string
  institution?: string
  asOf?: string
}

export interface CustodySnapshot {
  provider: 'pluggy'
  positions: CustodyPosition[]
  fetchedAt: string
}

interface PluggyAuthResponse { apiKey?: string }
interface PluggyInvestment {
  id?: string
  name?: string
  code?: string
  type?: string
  quantity?: number
  balance?: number
  amount?: number
  amountOriginal?: number
  amountProfit?: number
  issueDate?: string
  transactions?: PluggyInvestmentTransaction[]
  value?: number
  currencyCode?: string
  institution?: { name?: string } | string
  date?: string
}

interface PluggyListResponse { results?: PluggyInvestment[]; data?: PluggyInvestment[] }
interface PluggyItem { connector?: { name?: string } }
interface PluggyInvestmentTransaction {
  amount?: number
  netAmount?: number
  tradeDate?: string
  date?: string
  type?: string
}
interface CostBasis { originalAmount?: number; acquiredAt?: string; source?: CustodyPosition['costBasisSource'] }

// Pluggy can retain closed investment records with a zero quantity and a
// display-only cent-level quote. They are not custody positions and clutter
// the Portfolio table, so treat values that round to R$0.00 as zero.
const ZERO_VALUE_EPSILON = 0.005
const ZERO_QUANTITY_EPSILON = 1e-8
const TRANSACTION_CACHE_MS = 30 * 60 * 1000
const investmentTransactionCache = new Map<string, { expiresAt: number; transactions: PluggyInvestmentTransaction[] }>()

async function pluggyFetch(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${PLUGGY_API_URL}${path}`, { ...init, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Pluggy request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  return response
}

export async function createPluggyApiKey(credentials: PluggyCredentials): Promise<string> {
  const response = await pluggyFetch('/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  const body = await response.json() as PluggyAuthResponse
  if (!body.apiKey) throw new Error('Pluggy did not return an API key.')
  return body.apiKey
}

/** Read only investment custody. No payment, item mutation, or account-write endpoint is used. */
export async function fetchPluggyCustody(credentials: PluggyCredentials, itemIds: string[]): Promise<CustodySnapshot> {
  if (itemIds.length === 0) throw new Error('Add at least one MeuPluggy item ID before refreshing custody.')
  const apiKey = await createPluggyApiKey(credentials)
  const headers = { 'X-API-KEY': apiKey }
  const records = (await Promise.all(itemIds.map(async (itemId) => {
    const [itemResponse, investmentsResponse] = await Promise.all([
      pluggyFetch(`/items/${encodeURIComponent(itemId)}`, { headers }),
      pluggyFetch(`/investments?itemId=${encodeURIComponent(itemId)}`, { headers }),
    ])
    const item = await itemResponse.json() as PluggyItem
    const body = await investmentsResponse.json() as PluggyListResponse
    return (body.results ?? body.data ?? []).map((investment) => ({ investment, institution: item.connector?.name }))
  }))).flat()
  const resolvedRecords = await mapWithConcurrency(records, 5, async ({ investment, institution }) => {
    const candidateOriginal = finiteNumber(investment.amountOriginal)
    // Some connectors use zero as a placeholder for an unavailable cost
    // basis. An active, positive-value investment cannot have a meaningful
    // zero acquisition amount, so resolve it from transactions instead.
    const reportedOriginal = candidateOriginal != null && candidateOriginal > 0 ? candidateOriginal : undefined
    const embeddedBasis = deriveCostBasis(investment.transactions ?? [])
    // Keep the provider's original amount authoritative, but still obtain the
    // first application date from the transaction history when it is absent
    // from the (now-deprecated) embedded transaction list.
    const transactions = embeddedBasis.acquiredAt || !investment.id
      ? (investment.transactions ?? [])
      : await fetchInvestmentTransactions(investment.id, headers)
    const transactionBasis = embeddedBasis.acquiredAt ? embeddedBasis : deriveCostBasis(transactions)
    const costBasis: CostBasis = reportedOriginal != null
      ? { originalAmount: reportedOriginal, acquiredAt: transactionBasis.acquiredAt, source: 'reported' }
      : transactionBasis
    return { investment, institution, costBasis }
  })
  return {
    provider: 'pluggy',
    fetchedAt: new Date().toISOString(),
    positions: resolvedRecords.map(({ investment, institution, costBasis }, index) => ({
      id: investment.id ?? `${investment.code ?? investment.name ?? 'investment'}-${index}`,
      name: investment.name ?? investment.code ?? 'Unnamed investment',
      code: investment.code,
      type: investment.type,
      quantity: finiteNumber(investment.quantity),
      // Pluggy's `value` is the unit quota/asset price. The position total is
      // `balance` (net) and, when that is unavailable, `amount` (gross).
      value: finiteNumber(investment.balance ?? investment.amount),
      originalAmount: costBasis.originalAmount,
      profit: finiteNumber(investment.amountProfit),
      acquiredAt: costBasis.acquiredAt,
      costBasisSource: costBasis.source,
      grossAmount: finiteNumber(investment.amount),
      unitValue: finiteNumber(investment.value),
      currency: investment.currencyCode ?? 'BRL',
      institution: typeof investment.institution === 'string' ? investment.institution : investment.institution?.name ?? institution,
      asOf: investment.date,
    })).filter((position) =>
      Math.abs(position.value ?? 0) >= ZERO_VALUE_EPSILON ||
      Math.abs(position.quantity ?? 0) > ZERO_QUANTITY_EPSILON,
    ),
  }
}

async function fetchInvestmentTransactions(id: string, headers: Record<string, string>): Promise<PluggyInvestmentTransaction[]> {
  const cached = investmentTransactionCache.get(id)
  if (cached && cached.expiresAt > Date.now()) return cached.transactions
  try {
    const response = await pluggyFetch(`/investments/${encodeURIComponent(id)}/transactions?pageSize=500`, { headers })
    const body = await response.json() as PluggyListResponse
    const transactions = (body.results ?? body.data ?? []) as PluggyInvestmentTransaction[]
    investmentTransactionCache.set(id, { transactions, expiresAt: Date.now() + TRANSACTION_CACHE_MS })
    return transactions
  } catch {
    // Transaction history is connector-dependent. A missing or unsupported
    // history must not make a read-only custody refresh fail.
    investmentTransactionCache.set(id, { transactions: [], expiresAt: Date.now() + TRANSACTION_CACHE_MS })
    return []
  }
}

function deriveCostBasis(transactions: PluggyInvestmentTransaction[]): CostBasis {
  let purchases = 0
  let withdrawals = 0
  let acquiredAt: string | undefined
  for (const transaction of transactions) {
    const type = transaction.type?.toUpperCase() ?? ''
    const isPurchase = type === 'BUY' || type === 'APPLICATION' || type === 'DEPOSIT' || type === 'CONTRIBUTION'
    const isWithdrawal = type === 'SELL' || type === 'WITHDRAWAL' || type === 'REDEMPTION'
    if (isPurchase) {
      const date = transaction.tradeDate ?? transaction.date
      if (date && (!acquiredAt || date < acquiredAt)) acquiredAt = date
    }
    const amount = finiteNumber(transaction.netAmount ?? transaction.amount)
    if (amount == null) continue
    if (isPurchase) {
      purchases += amount
    } else if (isWithdrawal) {
      withdrawals += amount
    }
  }
  const originalAmount = purchases - withdrawals
  return originalAmount > 0 ? { originalAmount, acquiredAt, source: 'transactions' } : {}
}

async function mapWithConcurrency<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++
      results[index] = await mapper(values[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
