import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface WorkflowStep {
  name?: string
  run?: string
  uses?: string
  with?: {
    'node-version'?: string | number
  }
}

interface WorkflowJob {
  if?: string
  needs?: string | string[]
  steps?: WorkflowStep[]
}

const root = resolve(import.meta.dirname, '..')
const workflow = YAML.parse(
  readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'),
) as { jobs: Record<string, WorkflowJob> }

function commands(job: WorkflowJob): string[] {
  return job.steps?.flatMap((step) => step.run ? [step.run] : []) ?? []
}

describe('CI workflow fast failure lanes', () => {
  it('pins every CI lane to the supported Node runtime', () => {
    const setupSteps = Object.values(workflow.jobs).flatMap((job) =>
      job.steps?.filter((step) => step.uses?.startsWith('actions/setup-node@')) ?? [],
    )

    expect(setupSteps.length).toBeGreaterThan(0)
    for (const step of setupSteps) {
      expect(String(step.with?.['node-version'])).toBe('22.19.0')
    }
  })

  it('runs build and unit tests independently', () => {
    const build = workflow.jobs.build
    const test = workflow.jobs.test

    expect(build.needs).toBeUndefined()
    expect(test.needs).toBeUndefined()
    expect(commands(build)).toContain('pnpm build')
    expect(commands(build)).not.toContain('pnpm test')
    expect(commands(test)).toContain('pnpm test')
    expect(commands(test)).not.toContain('pnpm build')
  })

  it('preserves build-and-test as the aggregate confidence gate', () => {
    const aggregate = workflow.jobs['build-and-test']

    expect(aggregate.if).toContain('always()')
    expect(aggregate.needs).toEqual(['build', 'test'])
    expect(aggregate.steps?.map((step) => step.name)).toContain(
      'Require successful build and test lanes',
    )
  })
})
