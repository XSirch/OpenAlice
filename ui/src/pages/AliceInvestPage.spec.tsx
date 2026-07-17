import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { AliceInvestPage } from './AliceInvestPage'
import { aliceInvestApi } from '../api/alice-invest'

afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('AliceInvestPage',()=>{
  it('renders evidence separately from configuration and keeps execution unavailable',async()=>{
    vi.spyOn(aliceInvestApi,'load').mockResolvedValue({executionEnabled:false,switches:{active_signal_monitor_enabled:false},readiness:[{capability:'global',state:'not_ready',evaluatedAt:'2026-07-16T12:00:00.000Z',evidence:[{criterion:'execution_disabled',status:'passed',observedAt:'2026-07-16T12:00:00.000Z',source:'local'}],blockers:['ci: evidence not recorded']}]})
    render(<AliceInvestPage />)
    await waitFor(()=>expect(screen.getByText('Derived readiness')).toBeTruthy())
    expect(screen.getByText(/State: not_ready/)).toBeTruthy()
    expect(screen.getByText(/execution_disabled: passed/)).toBeTruthy()
    expect(screen.getByText(/Configuration and kill switches/)).toBeTruthy()
    expect(screen.getByText(/Execution is permanently unavailable/)).toBeTruthy()
  })
  it('fails closed in the rendered error state',async()=>{
    vi.spyOn(aliceInvestApi,'load').mockRejectedValue(new Error('offline'))
    render(<AliceInvestPage />)
    await waitFor(()=>expect(screen.getByText(/No capability should be treated as ready/)).toBeTruthy())
  })
})
