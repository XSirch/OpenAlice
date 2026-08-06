export interface PtyProcess {
  readonly pid: number
  onData(callback: (data: string | Buffer) => void): unknown
  onExit(callback: (event: { exitCode: number; signal?: number }) => void): unknown
  write(data: string): void
  resize(cols: number, rows: number): void
  pause(): void
  resume(): void
  kill(signal?: string): void
}

interface PtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      name?: string
      cols?: number
      rows?: number
      cwd?: string
      env?: Record<string, string>
      encoding?: string | null
    },
  ): PtyProcess
}

let loadedPty: PtyModule | null = null
let loadError: unknown = null

try {
  loadedPty = await import('node-pty') as unknown as PtyModule
} catch (error) {
  loadError = error
}

export function requirePty(): PtyModule {
  if (loadedPty) return loadedPty
  const detail = loadError instanceof Error ? `: ${loadError.message}` : ''
  throw new Error(
    `Workspace terminals require the optional node-pty native addon${detail}. `
    + 'Install the Linux runtime build dependencies (python3, make, and g++) and run pnpm install again.',
  )
}
