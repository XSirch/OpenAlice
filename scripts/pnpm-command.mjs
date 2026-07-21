import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Compose a shell-free pnpm child-process command on POSIX and the equivalent
 * cmd.exe invocation required for Corepack's pnpm.cmd shim on Windows.
 *
 * Arguments are repository-owned release/build inputs. Quote every argument
 * on Windows so paths with spaces and cmd metacharacters stay one argument.
 */
export function composePnpmCommand(commandArgs, options = {}) {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  if (platform !== 'win32') {
    return {
      command: 'pnpm',
      args: [...commandArgs],
      windowsVerbatimArguments: false,
    }
  }

  const pnpmCommand = options.windowsPnpmCommand ?? resolveWindowsPnpmCommand(env)
  const commandLine = [quotePnpmCommand(pnpmCommand), ...commandArgs.map(quoteCmdArgument)].join(' ')
  return {
    command: env.ComSpec ?? env.COMSPEC ?? 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
    // The command line is already quoted for cmd.exe. Letting Node quote it a
    // second time makes the quotes around pnpm arguments literal on Windows.
    windowsVerbatimArguments: true,
  }
}

function resolveWindowsPnpmCommand(env) {
  // pnpm/action-setup installs a direct pnpm.cmd shim here. Prefer it over
  // Node's Corepack shim: on hosted Windows runners Corepack may block while
  // it resolves its managed release, even though pnpm is already available.
  const pnpmHome = env.PNPM_HOME
  if (pnpmHome && existsSync(join(pnpmHome, 'pnpm.cmd'))) {
    return join(pnpmHome, 'pnpm.cmd')
  }

  const nodeDirectory = dirname(process.execPath)
  if (existsSync(join(nodeDirectory, 'pnpm.cmd'))) {
    return 'pnpm.cmd'
  }

  // Corepack can be present without its global shims being enabled (for
  // example in a locked-down Windows installation). Invoke it directly so
  // release tooling remains usable without modifying the system PATH.
  return 'corepack.cmd pnpm'
}

/**
 * Run pnpm synchronously with the platform-specific quoting contract above.
 * Keep this wrapper as the shared release-script boundary so callers cannot
 * accidentally omit windowsVerbatimArguments when invoking pnpm.cmd.
 */
export function runPnpmSync(commandArgs, options = {}) {
  const { platform, ...spawnOptions } = options
  const invocation = composePnpmCommand(commandArgs, {
    platform,
    env: spawnOptions.env,
  })
  return spawnSync(invocation.command, invocation.args, {
    ...spawnOptions,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  })
}

function quoteCmdArgument(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function quotePnpmCommand(command) {
  // This fallback is a command plus its subcommand, rather than an executable
  // path. Keep its two tokens separate so cmd.exe can resolve Corepack.
  return command === 'corepack.cmd pnpm' || !command.includes(' ')
    ? command
    : quoteCmdArgument(command)
}
