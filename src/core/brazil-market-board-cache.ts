import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { BrazilMarketBoard } from '../domain/market-data/reference/types.js'
import { dataPath } from './paths.js'

const FILE = dataPath('cache', 'brazil-market-board.json')
const schema = z.object({ version: z.literal(1), refreshedAt: z.string().datetime(), board: z.unknown() })

export interface BrazilMarketBoardCache { version: 1; refreshedAt: string; board: BrazilMarketBoard }

export async function readBrazilMarketBoardCache(): Promise<BrazilMarketBoardCache | null> {
  try {
    const parsed = schema.parse(JSON.parse(await readFile(FILE, 'utf8')))
    return { ...parsed, board: parsed.board as BrazilMarketBoard }
  } catch { return null }
}

export async function writeBrazilMarketBoardCache(board: BrazilMarketBoard, refreshedAt = new Date().toISOString()): Promise<BrazilMarketBoardCache> {
  const cache: BrazilMarketBoardCache = { version: 1, refreshedAt, board }
  const temporary = `${FILE}.tmp-${process.pid}`
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(cache)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return cache
}

export interface PersistentBrazilBoardDeps {
  read: () => Promise<BrazilMarketBoardCache | null>
  write: (board: BrazilMarketBoard, refreshedAt: string) => Promise<unknown>
  refresh: () => Promise<BrazilMarketBoard>
  now?: () => Date
  ttlMs: number
}

/**
 * Use a durable board while it is fresh across process restarts. On a failed
 * refresh, return the last good board loudly marked stale instead of silently
 * replacing it with an empty response.
 */
export async function resolvePersistentBrazilBoard(deps: PersistentBrazilBoardDeps): Promise<{ board: BrazilMarketBoard; source: 'persistent-cache' | 'refresh' }> {
  const now = deps.now ?? (() => new Date())
  const cached = await deps.read()
  if (cached && now().getTime() - Date.parse(cached.refreshedAt) < deps.ttlMs) {
    return { board: withCacheMeta(cached.board, cached.refreshedAt, false), source: 'persistent-cache' }
  }
  try {
    const board = await deps.refresh()
    if (!board.cards.some((card) => card.latest != null)) throw new Error('Brazil market sources returned no usable observations.')
    const refreshedAt = now().toISOString()
    await deps.write(board, refreshedAt)
    return { board, source: 'refresh' }
  } catch (error) {
    if (cached) return { board: withCacheMeta(cached.board, cached.refreshedAt, true), source: 'persistent-cache' }
    throw error
  }
}

function withCacheMeta(board: BrazilMarketBoard, cachedAt: string, stale: boolean): BrazilMarketBoard {
  return { ...board, meta: { ...board.meta, cachedAt, ...(stale ? { stale: true } : {}) } }
}
