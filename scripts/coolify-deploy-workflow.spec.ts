import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface WorkflowStep {
  name?: string
  run?: string
}

interface WorkflowJob {
  if?: string
  environment?: string
  steps?: WorkflowStep[]
}

const workflow = YAML.parse(
  readFileSync(resolve(import.meta.dirname, '..', '.github/workflows/coolify-deploy.yml'), 'utf8'),
) as {
  on: {
    workflow_run?: { workflows?: string[]; types?: string[] }
    workflow_dispatch?: unknown
  }
  jobs: Record<string, WorkflowJob>
}

describe('Coolify deployment workflow', () => {
  it('deploys master only after the CI workflow succeeds', () => {
    expect(workflow.on.workflow_run).toEqual({ workflows: ['CI'], types: ['completed'] })
    expect(workflow.jobs.deploy.if).toContain("workflow_run.conclusion == 'success'")
    expect(workflow.jobs.deploy.if).toContain("workflow_run.head_branch == 'master'")
    expect(workflow.jobs.deploy.environment).toBe('production')
  })

  it('validates secrets before calling the authenticated deploy webhook', () => {
    const commands = workflow.jobs.deploy.steps?.map((step) => step.run ?? '').join('\n') ?? ''
    expect(commands).toContain('COOLIFY_WEBHOOK')
    expect(commands).toContain('COOLIFY_TOKEN')
    expect(commands).toContain('--fail-with-body')
    expect(commands).toContain('Authorization: Bearer $COOLIFY_TOKEN')
  })
})
