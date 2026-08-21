import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { dataPath } from '../src/core/paths.js'
import { collectFixedIncomeShadowArtifact, renderFixedIncomeShadowReportMarkdown } from '../src/domain/alice-invest/fixed-income/shadow-operations.js'
import { fixedIncomeShadowWalkthroughSchema, FixedIncomeShadowValidationStore } from '../src/domain/alice-invest/fixed-income/shadow-validation.js'

const state = new FixedIncomeShadowValidationStore(dataPath('state', 'fixed-income-shadow-validation.json'))

async function main(args: string[]): Promise<void> {
  const command = args[0]
  if (command === 'collect') {
    const artifactPath = args[1]
    if (!artifactPath || args.length !== 2) throw new Error('usage: pnpm fixed-income:shadow collect <artifact.json>')
    const bytes = await readFile(resolve(process.cwd(), artifactPath))
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('shadow artifact exceeds 2 MiB')
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const result = await collectFixedIncomeShadowArtifact(JSON.parse(raw), state)
    process.stdout.write(`${JSON.stringify({ command, ...result, report: await state.report() }, null, 2)}\n`)
    return
  }
  if (command === 'walkthrough') {
    const options = flags(args.slice(1))
    assertOnly(options, ['completed-at', 'reviewer', 'result', 'notes'])
    const walkthrough = fixedIncomeShadowWalkthroughSchema.parse({
      completedAt: options['completed-at'] ?? new Date().toISOString(), reviewer: options['reviewer'], result: options['result'], notes: options['notes'],
    })
    const stored = await state.recordWalkthrough(walkthrough)
    process.stdout.write(`${JSON.stringify({ command, stored, report: await state.report() }, null, 2)}\n`)
    return
  }
  if (command === 'report') {
    const options = flags(args.slice(1)); assertOnly(options, ['format', 'maximum-difference-brl'])
    const format = options['format'] ?? 'json'
    if (format !== 'json' && format !== 'markdown') throw new Error('--format must be json or markdown')
    const report = await state.report(options['maximum-difference-brl'])
    process.stdout.write(format === 'markdown' ? renderFixedIncomeShadowReportMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`)
    return
  }
  throw new Error('usage: pnpm fixed-income:shadow <collect|walkthrough|report> [options]')
}

function assertOnly(options: Record<string, string>, allowed: string[]): void {
  const unknown = Object.keys(options).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`unsupported option --${unknown}`)
}

function flags(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]; const value = args[index + 1]
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(`invalid option near ${name ?? '(missing)'}`)
    const key = name.slice(2)
    if (result[key] !== undefined) throw new Error(`duplicate option --${key}`)
    result[key] = value
  }
  return result
}

main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
