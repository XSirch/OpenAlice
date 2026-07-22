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
  value?: number
  currency: string
  institution?: string
  updatedAt?: string
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
  amount?: number
  value?: number
  currencyCode?: string
  institution?: { name?: string } | string
  updatedAt?: string
}

interface PluggyItem {
  id?: string
  connector?: { name?: string }
}

interface PluggyListResponse { results?: PluggyInvestment[]; data?: PluggyInvestment[] }
interface PluggyItemsResponse { results?: PluggyItem[]; data?: PluggyItem[] }

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
export async function fetchPluggyCustody(credentials: PluggyCredentials): Promise<CustodySnapshot> {
  const apiKey = await createPluggyApiKey(credentials)
  const headers = { 'X-API-KEY': apiKey }
  const itemsResponse = await pluggyFetch('/items', { headers })
  const itemsBody = await itemsResponse.json() as PluggyItemsResponse
  const items = (itemsBody.results ?? itemsBody.data ?? []).filter((item): item is PluggyItem & { id: string } => Boolean(item.id))
  const records = (await Promise.all(items.map(async (item) => {
    const response = await pluggyFetch(`/investments?itemId=${encodeURIComponent(item.id)}`, { headers })
    const body = await response.json() as PluggyListResponse
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
      value: finiteNumber(investment.value ?? investment.amount),
      currency: investment.currencyCode ?? 'BRL',
      institution: typeof investment.institution === 'string' ? investment.institution : investment.institution?.name ?? institution,
      updatedAt: investment.updatedAt,
    })),
  }
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
