import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface WorkflowStep {
  name?: string
  run?: string
}

interface WorkflowJob {
  name?: string
  needs?: string | string[]
  'runs-on'?: string
  steps?: WorkflowStep[]
}

interface Workflow {
  concurrency?: {
    group?: string
    'cancel-in-progress'?: boolean
  }
  jobs: Record<string, WorkflowJob>
}

const root = resolve(import.meta.dirname, '..')
const workflow = YAML.parse(
  readFileSync(resolve(root, '.github/workflows/desktop-package-smoke.yml'), 'utf8'),
) as Workflow

describe('Desktop Package Smoke workflow critical path', () => {
  it('cancels superseded runs for the same pull request or ref', () => {
    expect(workflow.concurrency).toEqual({
      group: 'desktop-package-smoke-${{ github.event.pull_request.number || github.ref }}',
      'cancel-in-progress': true,
    })
  })

  it('runs desktop packaging only on the Linux VPS target', () => {
    const preflight = workflow.jobs.preflight
    const desktop = workflow.jobs.package

    expect(preflight).toMatchObject({
      name: 'fast preflight',
      'runs-on': 'ubuntu-latest',
    })
    expect(preflight.needs).toBeUndefined()
    const preflightSteps = preflight.steps?.map((step) => step.name) ?? []
    expect(preflightSteps).toEqual(expect.arrayContaining([
      'Verify CI workflow contracts',
      'Typecheck root workspace',
    ]))
    expect(preflightSteps.indexOf('Verify CI workflow contracts')).toBeLessThan(
      preflightSteps.indexOf('Typecheck root workspace'),
    )
    expect(workflow.jobs['broker-packs-windows']).toBeUndefined()
    expect(desktop).toMatchObject({
      name: 'package ubuntu-latest',
      'runs-on': 'ubuntu-latest',
    })
    expect(desktop.needs).toBe('preflight')
    for (const job of Object.values(workflow.jobs)) {
      expect(job['runs-on']).not.toContain('windows')
      expect(job['runs-on']).not.toContain('macos')
    }
  })
})
