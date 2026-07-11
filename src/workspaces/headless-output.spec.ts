import { describe, expect, it } from 'vitest'

import { claudeAdapter } from './adapters/claude.js'
import { codexAdapter } from './adapters/codex.js'
import { opencodeAdapter } from './adapters/opencode.js'
import { piAdapter } from './adapters/pi.js'
import type { CliAdapter } from './cli-adapter.js'
import { parseHeadlessOutputText } from './headless-output.js'

function parse(
  adapter: CliAdapter,
  events: readonly Record<string, unknown>[],
  sourceTruncated = false,
) {
  return parseHeadlessOutputText({
    text: events.map((event) => JSON.stringify(event)).join('\n'),
    extractEvents: adapter.extractHeadlessOutputEvents?.bind(adapter),
    extractAssistantText: adapter.extractHeadlessAssistantText?.bind(adapter),
    sourceTruncated,
  })
}

describe('headless structured output', () => {
  it('pairs Claude tool_use/tool_result and keeps the final reply', () => {
    const output = parse(claudeAdapter, [
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'alice status' } }] },
      },
      {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Everything is ready.' }] } },
      { type: 'result', subtype: 'success', result: 'Everything is ready.' },
    ])
    expect(output.assistantText).toBe('Everything is ready.')
    expect(output.blocks).toContainEqual({
      type: 'tool', id: 't1', name: 'Bash', status: 'completed', input: { command: 'alice status' }, output: 'ok',
    })
    expect(output.metrics).toEqual({ textBlocks: 1, toolCalls: 1, toolFailures: 0 })
  })

  it('normalizes Codex command execution and file-change items', () => {
    const output = parse(codexAdapter, [
      { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'alice status', status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'alice status', aggregated_output: 'ok', exit_code: 0, status: 'completed' } },
      { type: 'item.started', item: { id: 'f1', type: 'file_change', changes: [{ path: 'report.md' }], status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'f1', type: 'file_change', changes: [{ path: 'report.md' }], status: 'completed' } },
      { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'Report written.' } },
    ])
    expect(output.assistantText).toBe('Report written.')
    expect(output.metrics.toolCalls).toBe(2)
    expect(output.blocks).toContainEqual(expect.objectContaining({ type: 'tool', id: 'c1', name: 'Shell', status: 'completed' }))
    expect(output.blocks).toContainEqual(expect.objectContaining({ type: 'tool', id: 'f1', name: 'File changes', status: 'completed' }))
  })

  it('keeps runtime-level failures as error blocks', () => {
    const codex = parse(codexAdapter, [
      { type: 'turn.failed', error: { message: 'Codex provider unavailable' } },
    ])
    const opencode = parse(opencodeAdapter, [
      { type: 'error', error: { name: 'APIError', data: { message: 'OpenCode provider unavailable' } } },
    ])
    const pi = parse(piAdapter, [
      {
        type: 'message_end',
        message: {
          role: 'assistant', stopReason: 'error', errorMessage: 'Pi provider unavailable', content: [],
        },
      },
    ])
    expect(codex.blocks).toContainEqual({ type: 'error', message: 'Codex provider unavailable' })
    expect(opencode.blocks).toContainEqual({ type: 'error', message: 'OpenCode provider unavailable' })
    expect(pi.blocks).toContainEqual({ type: 'error', message: 'Pi provider unavailable' })
  })

  it('normalizes Pi execution events and failed tools', () => {
    const output = parse(piAdapter, [
      { type: 'tool_execution_start', toolCallId: 'p1', toolName: 'bash', args: { command: 'false' } },
      { type: 'tool_execution_end', toolCallId: 'p1', toolName: 'bash', result: { content: 'failed' }, isError: true },
      { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'The command failed.' }] } },
    ])
    expect(output.assistantText).toBe('The command failed.')
    expect(output.metrics).toEqual({ textBlocks: 1, toolCalls: 1, toolFailures: 1 })
  })

  it('skips Pi cumulative message_update frames before JSON parsing', () => {
    const cumulativeFrame = '{"type":"message_update", deliberately-not-valid-json'
    expect(piAdapter.extractHeadlessOutputEvents?.(cumulativeFrame)).toEqual([])
    expect(piAdapter.extractHeadlessAssistantText?.(cumulativeFrame)).toBeNull()
  })

  it('accepts OpenCode part.state tool snapshots', () => {
    const output = parse(opencodeAdapter, [
      {
        type: 'tool_use',
        sessionID: 'ses_1',
        part: {
          type: 'tool', callID: 'o1', tool: 'bash',
          state: { status: 'completed', input: { command: 'alice status' }, output: 'ok' },
        },
      },
      { type: 'text', sessionID: 'ses_1', part: { type: 'text', text: 'Done.' } },
    ])
    expect(output.assistantText).toBe('Done.')
    expect(output.blocks).toContainEqual({
      type: 'tool', id: 'o1', name: 'bash', status: 'completed', input: { command: 'alice status' }, output: 'ok',
    })
  })

  it('marks unfinished tools failed after a finished/truncated run', () => {
    const output = parse(piAdapter, [
      { type: 'tool_execution_start', toolCallId: 'p1', toolName: 'bash', args: {} },
    ], true)
    expect(output.blocks).toContainEqual(expect.objectContaining({ id: 'p1', status: 'failed' }))
    expect(output.truncated).toBe(true)
  })
})
