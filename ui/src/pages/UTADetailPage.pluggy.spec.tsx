import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PluggyOverviewPanel } from './UTADetailPage'

describe('MeuPluggy overview', () => {
  it('shows bank accounts, cards, and investments grouped by the Item connector', () => {
    render(<PluggyOverviewPanel overview={{
      provider: 'pluggy',
      fetchedAt: '2026-08-06T12:00:00.000Z',
      institutions: [
        { itemId: 'nubank', name: 'Nubank', bankAccounts: [{ id: 'nu-bank', name: 'Conta', balance: 53.76, currency: 'BRL', numberLast4: '1234' }], creditCards: [{ id: 'nu-card', name: 'Ultravioleta', balance: 5948.08, currency: 'BRL', numberLast4: '1100' }], investments: { count: 21, total: 128467.18, currency: 'BRL' } },
        { itemId: 'itau', name: 'Itaú', bankAccounts: [{ id: 'itau-bank', name: 'Personnalité', balance: 718.59, currency: 'BRL' }], creditCards: [], investments: { count: 38, total: 64893.84, currency: 'BRL' } },
      ],
    }} />)
    expect(screen.getByRole('region', { name: 'MeuPluggy overview' })).toBeDefined()
    expect(screen.getAllByText('Nubank').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Itaú').length).toBeGreaterThan(0)
    expect(screen.getByText('21 ativos')).toBeDefined()
    expect(screen.getByText('38 ativos')).toBeDefined()
    expect(screen.getByText(/•••• 1100/)).toBeDefined()
  })
})
