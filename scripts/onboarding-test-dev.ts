import { spawn } from 'node:child_process'

import { buildOnboardingTestEnv } from './onboarding-test-env.js'

const printOnly = process.argv.includes('--print-env')
const { root, env } = buildOnboardingTestEnv()

console.log('')
console.log('[onboarding-test] starting OpenAlice with isolated first-run state')
console.log(`[onboarding-test] root       → ${root}`)
console.log(`[onboarding-test] data       → ${env['OPENALICE_HOME']}`)
console.log(`[onboarding-test] workspaces → ${env['AQ_LAUNCHER_ROOT']}`)
console.log(`[onboarding-test] global     → ${env['OPENALICE_GLOBAL_DIR']}`)
console.log(`[onboarding-test] agents     → ${env['OPENALICE_AGENT_RUNTIME_INSTALLS']}`)
console.log(`[onboarding-test] UI         → http://localhost:${env['OPENALICE_UI_PORT']}`)
console.log('')

if (printOnly) {
  console.log(JSON.stringify({
    root,
    OPENALICE_HOME: env['OPENALICE_HOME'],
    AQ_LAUNCHER_ROOT: env['AQ_LAUNCHER_ROOT'],
    OPENALICE_GLOBAL_DIR: env['OPENALICE_GLOBAL_DIR'],
    OPENALICE_AGENT_RUNTIME_INSTALLS: env['OPENALICE_AGENT_RUNTIME_INSTALLS'],
    OPENALICE_TRADING_MODE: env['OPENALICE_TRADING_MODE'] ?? null,
    OPENALICE_UI_PORT: env['OPENALICE_UI_PORT'],
  }, null, 2))
  process.exit(0)
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(pnpm, ['dev'], {
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

