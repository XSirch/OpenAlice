import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readScheduleDeclaration } from './declaration.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sched-decl-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeDecl(content: string): Promise<void> {
  await mkdir(join(dir, '.alice'), { recursive: true })
  await writeFile(join(dir, '.alice', 'issue.json'), content, 'utf8')
}

async function writeLegacyDecl(content: string): Promise<void> {
  await mkdir(join(dir, '.alice'), { recursive: true })
  await writeFile(join(dir, '.alice', 'schedule.json'), content, 'utf8')
}

describe('readScheduleDeclaration', () => {
  it('reports absent when the file is missing', async () => {
    expect(await readScheduleDeclaration(dir)).toEqual({ ok: false, reason: 'absent' })
  })

  it('reports invalid on malformed JSON', async () => {
    await writeDecl('{ not json')
    const r = await readScheduleDeclaration(dir)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid')
  })

  it('reports invalid on a schema mismatch (unknown when.kind)', async () => {
    await writeDecl(JSON.stringify({ issues: [{ id: 't1', issue: 'noise', when: { kind: 'weekly' }, what: 'go' }] }))
    const r = await readScheduleDeclaration(dir)
    expect(r.ok).toBe(false)
  })

  it('reports invalid when a task is missing its prompt', async () => {
    await writeDecl(JSON.stringify({ issues: [{ id: 't1', issue: 'noise', when: { kind: 'every', every: '30m' } }] }))
    const r = await readScheduleDeclaration(dir)
    expect(r.ok).toBe(false)
  })

  it('reports invalid when an entry is missing its issue title', async () => {
    await writeDecl(JSON.stringify({ issues: [{ id: 't1', when: { kind: 'every', every: '30m' }, what: 'go' }] }))
    const r = await readScheduleDeclaration(dir)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid')
  })

  it('reports invalid (with a rename hint) when only the legacy schedule.json exists', async () => {
    await writeLegacyDecl(
      JSON.stringify({ issues: [{ id: 't1', issue: 'legacy', when: { kind: 'every', every: '30m' }, what: 'go' }] }),
    )
    const r = await readScheduleDeclaration(dir)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('invalid')
      if (r.reason === 'invalid') {
        expect(r.error).toMatch(/renamed/)
        expect(r.error).toContain('.alice/schedule.json')
        expect(r.error).toContain('.alice/issue.json')
      }
    }
  })

  it('parses a valid declaration', async () => {
    await writeDecl(
      JSON.stringify({
        issues: [
          { id: 'research', issue: 'morning research', when: { kind: 'every', every: '30m' }, what: 'run research' },
          {
            id: 'eod',
            issue: 'end-of-day summary',
            when: { kind: 'cron', cron: '0 16 * * 1-5' },
            what: 'summarize',
            agent: 'codex',
            enabled: false,
          },
        ],
      }),
    )
    const r = await readScheduleDeclaration(dir)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.tasks).toHaveLength(2)
      expect(r.tasks[0]).toMatchObject({ id: 'research', issue: 'morning research', what: 'run research' })
      expect(r.tasks[1]).toMatchObject({ id: 'eod', issue: 'end-of-day summary', agent: 'codex', enabled: false })
    }
  })
})
