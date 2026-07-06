import { describe, expect, it } from 'vitest'

import { buildOnboardingTestEnv } from './onboarding-test-env.js'

describe('buildOnboardingTestEnv', () => {
  it('builds an isolated fresh-run environment by default', () => {
    const { root, env } = buildOnboardingTestEnv({}, { root: '/tmp/oa-onboarding' })

    expect(root).toBe('/tmp/oa-onboarding')
    expect(env['OPENALICE_ONBOARDING_TEST']).toBe('1')
    expect(env['OPENALICE_HOME']).toBe('/tmp/oa-onboarding/home')
    expect(env['AQ_LAUNCHER_ROOT']).toBe('/tmp/oa-onboarding/workspaces')
    expect(env['OPENALICE_GLOBAL_DIR']).toBe('/tmp/oa-onboarding/global')
    expect(env['OPENALICE_AGENT_RUNTIME_INSTALLS']).toBe('none')
    expect(env['OPENALICE_UI_PORT']).toBe('15173')
    expect(env['OPENALICE_TRADING_MODE']).toBeUndefined()
  })

  it('scrubs inherited trading env unless the onboarding-specific mode is set', () => {
    const { env } = buildOnboardingTestEnv({
      OPENALICE_TRADING_MODE: 'pro',
      OPENALICE_LITE_MODE: '1',
      OPENALICE_ONBOARDING_TRADING_MODE: 'readonly',
    }, { root: '/tmp/oa-onboarding' })

    expect(env['OPENALICE_TRADING_MODE']).toBe('readonly')
    expect(env['OPENALICE_LITE_MODE']).toBeUndefined()
    expect(env['OPENALICE_UTA_DISABLED']).toBeUndefined()
  })

  it('preserves explicit roots, ports, and agent runtime profile', () => {
    const { env } = buildOnboardingTestEnv({
      OPENALICE_HOME: '/custom/home',
      AQ_LAUNCHER_ROOT: '/custom/workspaces',
      OPENALICE_GLOBAL_DIR: '/custom/global',
      OPENALICE_UI_PORT: '25173',
      OPENALICE_AGENT_RUNTIME_INSTALLS: 'only:codex',
    }, { root: '/tmp/oa-onboarding' })

    expect(env['OPENALICE_HOME']).toBe('/custom/home')
    expect(env['AQ_LAUNCHER_ROOT']).toBe('/custom/workspaces')
    expect(env['OPENALICE_GLOBAL_DIR']).toBe('/custom/global')
    expect(env['OPENALICE_UI_PORT']).toBe('25173')
    expect(env['OPENALICE_AGENT_RUNTIME_INSTALLS']).toBe('only:codex')
  })
})

