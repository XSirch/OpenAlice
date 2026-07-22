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
  value?: number
  currencyCode?: string
  institution?: { name?: string } | string
  date?: string
}

interface PluggyListResponse { results?: PluggyInvestment[]; data?: PluggyInvestment[] }
interface PluggyItem { connector?: { name?: string } }

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
  return {
    provider: 'pluggy',
    fetchedAt: new Date().toISOString(),
    positions: records.map(({ investment, institution }, index) => ({
      id: investment.id ?? `${investment.code ?? investment.name ?? 'investment'}-${index}`,
      name: investment.name ?? investment.code ?? 'Unnamed investment',
      code: investment.code,
      type: investment.type,
      quantity: finiteNumber(investment.quantity),
      // Pluggy's `value` is the unit quota/asset price. The position total is
      // `balance` (net) and, when that is unavailable, `amount` (gross).
      value: finiteNumber(investment.balance ?? investment.amount),
      grossAmount: finiteNumber(investment.amount),
      unitValue: finiteNumber(investment.value),
      currency: investment.currencyCode ?? 'BRL',
      institution: typeof investment.institution === 'string' ? investment.institution : investment.institution?.name ?? institution,
      asOf: investment.date,
    })),
  }
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
