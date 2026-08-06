import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, normalize, resolve, sep } from 'node:path'
import { exec as gitExec } from 'dugite'

export class MarkdownEditError extends Error {
  constructor(
    readonly code: 'invalid_path' | 'not_markdown' | 'file_not_found' | 'symlink_not_allowed' | 'revision_conflict' | 'git_failed',
    message: string,
  ) {
    super(message)
    this.name = 'MarkdownEditError'
  }
}

export function markdownRevision(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export async function updateWorkspaceMarkdown(input: {
  workspaceDir: string
  path: string
  content: string
  expectedRevision: string
}): Promise<{ revision: string; commit: string }> {
  const relativePath = normalizeWorkspaceMarkdownPath(input.path)
  const absolutePath = resolve(input.workspaceDir, relativePath)
  let entry
  try {
    entry = await lstat(absolutePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MarkdownEditError('file_not_found', 'Markdown file does not exist.')
    }
    throw error
  }
  if (entry.isSymbolicLink()) {
    throw new MarkdownEditError('symlink_not_allowed', 'Markdown symlinks cannot be edited from the UI.')
  }
  if (!entry.isFile()) throw new MarkdownEditError('file_not_found', 'Markdown path is not a file.')

  const current = await readFile(absolutePath, 'utf8')
  if (markdownRevision(current) !== input.expectedRevision) {
    throw new MarkdownEditError('revision_conflict', 'The file changed after it was opened. Reload before saving.')
  }
  if (current === input.content) {
    return { revision: input.expectedRevision, commit: await currentHead(input.workspaceDir) }
  }

  const temporaryPath = resolve(dirname(absolutePath), `.${randomUUID()}.openalice.tmp`)
  try {
    await writeFile(temporaryPath, input.content, 'utf8')
    await rename(temporaryPath, absolutePath)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }

  const message = relativePath.replaceAll('\\', '/') === 'portfolio/goal.md'
    ? 'portfolio: update current goal'
    : `workspace: update ${relativePath.replaceAll('\\', '/')}`
  const result = await gitExec([
    '-c', 'user.email=launcher@local',
    '-c', 'user.name=OpenAlice',
    'commit', '--only', '-q', '-m', message, '--', relativePath,
  ], input.workspaceDir)
  if (result.exitCode !== 0) {
    throw new MarkdownEditError('git_failed', `git commit failed: ${String(result.stderr).slice(0, 500)}`)
  }
  return {
    revision: markdownRevision(input.content),
    commit: await currentHead(input.workspaceDir),
  }
}

function normalizeWorkspaceMarkdownPath(path: string): string {
  const clean = normalize(path)
  if (!path || isAbsolute(clean) || clean === '..' || clean.startsWith(`..${sep}`)) {
    throw new MarkdownEditError('invalid_path', 'Refused to escape the workspace.')
  }
  if (extname(clean).toLowerCase() !== '.md') {
    throw new MarkdownEditError('not_markdown', 'Only existing Markdown files can be edited.')
  }
  return clean
}

async function currentHead(workspaceDir: string): Promise<string> {
  const result = await gitExec(['rev-parse', 'HEAD'], workspaceDir)
  if (result.exitCode !== 0) {
    throw new MarkdownEditError('git_failed', `git rev-parse failed: ${String(result.stderr).slice(0, 500)}`)
  }
  return String(result.stdout).trim()
}
