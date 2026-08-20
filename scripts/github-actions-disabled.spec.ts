import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GitHub Actions policy', () => {
  it('keeps the repository free of GitHub Actions workflow files', () => {
    const workflowsDirectory = resolve(import.meta.dirname, '..', '.github', 'workflows')
    const workflowFiles = existsSync(workflowsDirectory)
      ? readdirSync(workflowsDirectory)
          .filter((name) => /\.ya?ml$/i.test(name))
          .sort()
      : []

    expect(workflowFiles).toEqual([])
  })
})
