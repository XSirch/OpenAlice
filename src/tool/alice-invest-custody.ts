import { tool } from 'ai'
import { z } from 'zod'
import { readFixedIncomeCustodyDefinitions, writeFixedIncomeCustodyDefinitions } from '../core/fixed-income-custody.js'
import { readOpenFinanceConfig } from '../core/open-finance-config.js'
import { fixedIncomeProductSchema } from '../domain/alice-invest/fixed-income/contracts.js'
import { fetchPluggyCustody } from '../domain/open-finance/pluggy.js'

/** Read-only custody context plus an explicitly-confirmed classification write.
 * The model must show its proposal and obtain user confirmation before calling
 * the mutation tool; no FGC fact is inferred by this implementation. */
export function createAliceInvestCustodyTools(deps = {
  readConfig: readOpenFinanceConfig,
  readDefinitions: readFixedIncomeCustodyDefinitions,
  writeDefinitions: writeFixedIncomeCustodyDefinitions,
  fetchCustody: fetchPluggyCustody,
}) {
  return {
    aliceInvestListCustodyForClassification: tool({
      description: 'Read MeuPluggy custody positions and any existing fixed-income classifications. Use this before proposing FGC/product/issuer metadata. It returns no credentials. Do not infer FGC eligibility from a name alone; ask for a statement or use an official source and disclose it.',
      inputSchema: z.object({}).strict(),
      execute: async () => {
        const config = await deps.readConfig()
        if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return { ok: false as const, error: 'MeuPluggy is not configured.' }
        const [snapshot, definitions] = await Promise.all([
          deps.fetchCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds),
          deps.readDefinitions(),
        ])
        const classified = new Map(definitions.entries.map((entry) => [entry.source.positionId, entry.product]))
        return { ok: true as const, fetchedAt: snapshot.fetchedAt, positions: snapshot.positions.map((position) => ({ id: position.id, name: position.name, code: position.code ?? null, type: position.type ?? null, value: position.value ?? null, currency: position.currency, asOf: position.asOf ?? null, classification: classified.get(position.id) ?? null })) }
      },
    }),
    aliceInvestConfirmFixedIncomeClassification: tool({
      description: 'Persist one MeuPluggy fixed-income classification only after the user has explicitly confirmed the exact proposed values in the conversation. This affects analytical FGC, liquidity and macro panels but never places an order. Set confirmed=true only after that confirmation. Preserve unknown FGC when evidence is insufficient.',
      inputSchema: z.object({ positionId: z.string().trim().min(1).max(256), product: fixedIncomeProductSchema, confirmed: z.literal(true) }).strict(),
      execute: async ({ positionId, product }) => {
        const config = await deps.readConfig()
        if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return { ok: false as const, error: 'MeuPluggy is not configured.' }
        const snapshot = await deps.fetchCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds)
        if (!snapshot.positions.some((position) => position.id === positionId)) return { ok: false as const, error: 'The custody position is not present in the latest MeuPluggy snapshot.' }
        const current = await deps.readDefinitions()
        const entries = [...current.entries.filter((entry) => entry.source.positionId !== positionId), { source: { provider: 'pluggy' as const, positionId }, product }]
        await deps.writeDefinitions({ version: 1, entries })
        return { ok: true as const, positionId, fgcStatus: product.fgc.status, message: 'Classification saved. Refresh the Portfolio to recalculate FGC and related analysis.' }
      },
    }),
  }
}
