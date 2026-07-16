import { describe, expect, it } from 'vitest'
import { classifyInvestFastPath } from './fast-path.js'

describe('Alice Invest fast path', () => {
  it('handles only allowlisted local commands', () => {
    expect(classifyInvestFastPath('/portfolio')).toEqual({ kind: 'local_command', command: 'portfolio' })
    expect(classifyInvestFastPath('/new fresh context')).toEqual({ kind: 'local_command', command: 'new' })
    expect(classifyInvestFastPath('/order PETR4')).toBeUndefined()
  })

  it('blocks execution requests before a provider can be selected', () => {
    expect(classifyInvestFastPath('compre PETR4 agora')).toEqual({ kind: 'block_execution_request', reason: 'execution_disabled' })
    expect(classifyInvestFastPath('please place an order')).toEqual({ kind: 'block_execution_request', reason: 'execution_disabled' })
  })

  it('passes through only unequivocal informational requests', () => {
    expect(classifyInvestFastPath('ajuda?')).toEqual({ kind: 'pass_through' })
    expect(classifyInvestFastPath('qual ação devo comprar?')).toBeUndefined()
    expect(classifyInvestFastPath('')).toBeUndefined()
  })
})
