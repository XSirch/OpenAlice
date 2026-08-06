import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

interface WorkflowStep {
  id?: string
  if?: string
  name?: string
  uses?: string
  with?: Record<string, unknown>
}

interface WorkflowJob {
  'runs-on'?: string
  needs?: string | string[]
  steps?: WorkflowStep[]
  strategy?: {
    matrix?: {
      include?: Array<{ os?: string; platform?: string; arch?: string }>
    }
  }
}

const root = resolve(import.meta.dirname, '..')
const workflow = YAML.parse(
  readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8'),
) as { jobs: Record<string, WorkflowJob> }

function step(job: WorkflowJob, name: string): WorkflowStep {
  const found = job.steps?.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`release workflow step is missing: ${name}`)
  return found
}

function needs(job: WorkflowJob): string[] {
  if (!job.needs) return []
  return Array.isArray(job.needs) ? job.needs : [job.needs]
}

describe('Release workflow critical path', () => {
  it('contains no macOS or Windows release jobs', () => {
    expect(workflow.jobs['build-desktop']).toBeUndefined()
    expect(workflow.jobs['accept-desktop-upgrade']).toBeUndefined()

    for (const job of Object.values(workflow.jobs)) {
      expect(job['runs-on'] ?? '').not.toMatch(/macos|windows/i)
      for (const target of job.strategy?.matrix?.include ?? []) {
        expect(target.os ?? '').not.toMatch(/macos|windows/i)
        expect(target.platform ?? '').not.toBe('darwin')
      }
    }
  })

  it('builds Broker Packs only for Linux', () => {
    const brokerPacks = workflow.jobs['build-broker-packs']

    expect(brokerPacks.strategy?.matrix?.include).toEqual([
      { os: 'ubuntu-latest', arch: 'x64' },
    ])
    expect(step(brokerPacks, 'Preserve Broker Packs').with?.['name']).toBe(
      'broker-packs-${{ runner.os }}-${{ matrix.arch }}',
    )
  })

  it('builds headless Runtime only for Linux x64 and arm64', () => {
    expect(workflow.jobs['build-headless-runtime'].strategy?.matrix?.include).toEqual([
      { os: 'ubuntu-24.04', platform: 'linux', arch: 'x64' },
      { os: 'ubuntu-24.04-arm', platform: 'linux', arch: 'arm64' },
    ])
  })

  it('gates publication only on Linux release candidates', () => {
    expect(needs(workflow.jobs['publish-release'])).toEqual([
      'release',
      'build-headless-runtime',
      'build-broker-packs',
      'cli-installer-acceptance',
    ])
    const publish = step(workflow.jobs['publish-release'], 'Create tag and GitHub Release from accepted candidates')
    expect(String(publish.with?.files)).not.toMatch(/\.dmg|\.exe|\.blockmap|release-assets/)
  })

  it('treats the R2 mirror as optional when repository secrets are absent', () => {
    const mirror = workflow.jobs['mirror-release-assets']
    expect(step(mirror, 'Check optional R2 configuration').id).toBe('r2')
    expect(step(mirror, 'Install AWS CLI').if).toBe("steps.r2.outputs.enabled == 'true'")
    expect(step(mirror, 'Mirror release assets to Cloudflare R2').if).toBe(
      "steps.r2.outputs.enabled == 'true'",
    )
    expect(step(mirror, 'Verify CDN metadata').if).toBe("steps.r2.outputs.enabled == 'true'")
  })
})
