import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(import.meta.dirname, '../../..')
const fixedIncomeDomain = resolve(import.meta.dirname)
const optionalSurfaces = [
  join(sourceRoot, 'tool', 'alice-invest-fixed-income.ts'),
  join(sourceRoot, 'webui', 'routes', 'fixed-income.ts'),
]

describe('fixed-income no-execution architecture', () => {
  it('does not import UTA/trading write modules or call broker-write verbs', () => {
    const files = [
      ...typescriptFiles(fixedIncomeDomain),
      ...optionalSurfaces.filter((path) => existsSync(path)),
    ].filter((path) => !path.endsWith('.spec.ts'))

    for (const path of files) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).not.toMatch(/from\s+['"][^'"]*(?:services\/uta-client|domain\/trading|tool\/trading)[^'"]*['"]/)
      expect(source, path).not.toMatch(/\.(?:placeOrder|modifyOrder|cancelOrder|withdraw|transfer)\s*\(/)
    }
  })

  it('does not expose a financial execution route', () => {
    const routeDirectory = join(sourceRoot, 'webui', 'routes')
    const source = typescriptFiles(routeDirectory)
      .filter((path) => !path.endsWith('.spec.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(source).not.toMatch(/\.(?:post|put|delete)\(\s*['"]\/fixed-income\/(?:buy|sell|order|withdraw|transfer)/)
  })
})

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return typescriptFiles(path)
    return extname(entry.name) === '.ts' ? [path] : []
  })
}
