import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exec as gitExec } from 'dugite'
import { describe, expect, it } from 'vitest'
import { markdownRevision, updateWorkspaceMarkdown } from './markdown-editor.js'

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'openalice-md-edit-'))
  await gitExec(['init', '-q'], dir)
  await writeFile(join(dir, 'goal.md'), '# Before\n', 'utf8')
  await writeFile(join(dir, 'unrelated.md'), '# Unrelated\n', 'utf8')
  await gitExec(['add', '.'], dir)
  await gitExec(['-c', 'user.email=test@local', '-c', 'user.name=test', 'commit', '-q', '-m', 'root'], dir)
  return dir
}

describe('updateWorkspaceMarkdown', () => {
  it('commits only the edited Markdown path and preserves unrelated work', async () => {
    const dir = await fixture()
    await writeFile(join(dir, 'unrelated.md'), '# User work\n', 'utf8')
    const result = await updateWorkspaceMarkdown({ workspaceDir: dir, path: 'goal.md', content: '# After\n', expectedRevision: markdownRevision('# Before\n') })
    expect(result.revision).toBe(markdownRevision('# After\n'))
    expect(await readFile(join(dir, 'unrelated.md'), 'utf8')).toBe('# User work\n')
    const committed = await gitExec(['show', '--pretty=', '--name-only', 'HEAD'], dir)
    expect(String(committed.stdout).trim()).toBe('goal.md')
  })

  it('rejects stale revisions, traversal, and non-Markdown files', async () => {
    const dir = await fixture()
    await expect(updateWorkspaceMarkdown({ workspaceDir: dir, path: 'goal.md', content: 'new', expectedRevision: 'stale' })).rejects.toMatchObject({ code: 'revision_conflict' })
    await expect(updateWorkspaceMarkdown({ workspaceDir: dir, path: '../goal.md', content: 'new', expectedRevision: 'x' })).rejects.toMatchObject({ code: 'invalid_path' })
    await expect(updateWorkspaceMarkdown({ workspaceDir: dir, path: 'goal.txt', content: 'new', expectedRevision: 'x' })).rejects.toMatchObject({ code: 'not_markdown' })
  })

  it.skipIf(process.platform === 'win32')('rejects Markdown symlinks', async () => {
    const dir = await fixture()
    await symlink(join(dir, 'goal.md'), join(dir, 'linked.md'))
    await expect(updateWorkspaceMarkdown({ workspaceDir: dir, path: 'linked.md', content: 'new', expectedRevision: markdownRevision('# Before\n') })).rejects.toMatchObject({ code: 'symlink_not_allowed' })
  })
})
