// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'

import {
  DEMO_CHAT_WORKSPACE_ID,
  DEMO_ALICE_PORTFOLIO_WORKSPACE_ID,
  DEMO_WORKSPACE_ID,
} from '../fixtures/workspaces'
import {
  demoWorkspaceFilePaths,
  demoWorkspaceFiles,
} from '../fixtures/inbox'
import { workspacesHandlers } from './workspaces'

const server = setupServer(...workspacesHandlers)
const baseUrl = window.location.origin

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function listFiles(workspaceId: string, path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  const response = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/files${query}`)
  return {
    response,
    body: await response.json() as {
      path: string
      entries: Array<{
        name: string
        kind: 'file' | 'dir'
        sizeBytes: number | null
        mtime: string
      }>
    },
  }
}

describe('demo Workspace file listings', () => {
  it('round-trips a revision-safe Alice Portfolio Markdown update', async () => {
    const root = await listFiles(DEMO_ALICE_PORTFOLIO_WORKSPACE_ID)
    expect(root.body.entries).toMatchObject([{ name: 'portfolio', kind: 'dir' }])
    const portfolio = await listFiles(DEMO_ALICE_PORTFOLIO_WORKSPACE_ID, 'portfolio')
    expect(portfolio.body.entries).toMatchObject([{ name: 'goal.md', kind: 'file' }])
    const read = await fetch(`${baseUrl}/api/workspaces/${DEMO_ALICE_PORTFOLIO_WORKSPACE_ID}/file?path=portfolio%2Fgoal.md`)
    const initial = await read.json() as { revision: string }
    const update = await fetch(`${baseUrl}/api/workspaces/${DEMO_ALICE_PORTFOLIO_WORKSPACE_ID}/file`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'portfolio/goal.md', content: '# Novo objetivo\n', expectedRevision: initial.revision }),
    })
    expect(update.status).toBe(200)
    await expect(update.json()).resolves.toMatchObject({ commit: 'demo-portfolio-commit' })
  })
  it('assigns every readable demo artifact to a Workspace directory', () => {
    const indexedPaths = Object.values(demoWorkspaceFilePaths).flat().sort()
    expect(indexedPaths).toEqual(Object.keys(demoWorkspaceFiles).sort())
  })

  it('shows the report written by the featured AAPL Session', async () => {
    const { response, body } = await listFiles(DEMO_WORKSPACE_ID)

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      path: '',
      entries: [{
        name: 'research-AAPL-q1.md',
        kind: 'file',
        mtime: expect.any(String),
      }],
    })
    expect(body.entries[0]?.sizeBytes).toBeGreaterThan(0)
  })

  it('builds navigable directories for the Chat Workspace notes', async () => {
    const root = await listFiles(DEMO_CHAT_WORKSPACE_ID)
    expect(root.body.entries).toEqual([
      expect.objectContaining({ name: 'rotation', kind: 'dir', sizeBytes: null }),
      expect.objectContaining({ name: 'power_buy_points_2026-06-02.md', kind: 'file' }),
    ])

    const rotation = await listFiles(DEMO_CHAT_WORKSPACE_ID, 'rotation')
    expect(rotation.body.path).toBe('rotation')
    expect(rotation.body.entries.map((entry) => entry.name)).toEqual([
      '2026-06-02.md',
      'ai-chain-2026-06-02.md',
      'missed-rightside-2026-06-02.md',
    ])
    expect(rotation.body.entries.every((entry) => entry.kind === 'file')).toBe(true)
  })

  it('rejects paths that try to leave the Workspace', async () => {
    const { response } = await listFiles(DEMO_WORKSPACE_ID, '../secrets')
    expect(response.status).toBe(400)
  })
})
