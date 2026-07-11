import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createHeadlessRoutes } from './headless.js'
import { headlessLogPaths } from '../../workspaces/headless-task-registry.js'
import type { WorkspaceService } from '../../workspaces/service.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TASKS = [
  { taskId: 't1', wsId: 'w1', agent: 'codex', status: 'done', startedAt: 1 },
  { taskId: 't2', wsId: 'w2', agent: 'pi', status: 'running', startedAt: 2 },
]

function build(logsDir = '/tmp/openalice-headless-route-test') {
  const list = vi.fn((opts: any = {}) =>
    TASKS.filter(
      (t) => (!opts.wsId || t.wsId === opts.wsId) && (!opts.status || t.status === opts.status),
    ),
  )
  const get = vi.fn((id: string) => TASKS.find((t) => t.taskId === id) ?? null)
  const runningCount = vi.fn(() => TASKS.filter((task) => task.status === 'running').length)
  const svc = {
    headlessTasks: { list, get, runningCount },
    headlessCapacity: 8,
    headlessLogsDir: logsDir,
    adapters: { get: vi.fn(() => null) },
  } as unknown as WorkspaceService
  return { app: createHeadlessRoutes(svc), list, get }
}

describe('GET /api/headless', () => {
  it('lists tasks', async () => {
    const { app } = build()
    const r = await app.request('/')
    expect(r.status).toBe(200)
    const body = (await r.json()) as any
    expect(body.tasks.length).toBe(2)
    expect(body.capacity).toEqual({ running: 1, limit: 8 })
  })

  it('passes wsId/status/limit filters through to the registry', async () => {
    const { app, list } = build()
    await app.request('/?wsId=w1&status=done&limit=5')
    expect(list).toHaveBeenCalledWith({ wsId: 'w1', status: 'done', limit: 5 })
  })

  it('ignores an invalid status (→ undefined)', async () => {
    const { app, list } = build()
    await app.request('/?status=bogus')
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }))
  })

  it('GET /:taskId returns one record', async () => {
    const { app } = build()
    const r = await app.request('/t1')
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).taskId).toBe('t1')
  })

  it('GET /:taskId 404s on unknown id', async () => {
    const { app } = build()
    expect((await app.request('/nope')).status).toBe(404)
  })

  it('GET /:taskId/output returns the persisted normalized snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'headless-route-'))
    try {
      const paths = headlessLogPaths(dir, 't1')
      await writeFile(paths.stdout, '{"vendor":"event"}\n')
      await writeFile(paths.stderr, '')
      await writeFile(paths.structured, JSON.stringify({
        schemaVersion: 1,
        assistantText: 'Ready.',
        blocks: [{ type: 'tool', id: 'tool-1', name: 'bash', status: 'completed', output: 'ok' }],
        metrics: { textBlocks: 0, toolCalls: 1, toolFailures: 0 },
        truncated: false,
      }))
      const { app } = build(dir)
      const response = await app.request('/t1/output')
      expect(response.status).toBe(200)
      const body = (await response.json()) as any
      expect(body.structured.assistantText).toBe('Ready.')
      expect(body.structured.metrics.toolCalls).toBe(1)
      expect(body.stdout.text).toContain('vendor')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
