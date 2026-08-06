import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AlicePortfolioSidebar } from './AlicePortfolioSidebar'

const openOrFocus = vi.fn()

vi.mock('../../contexts/workspaces-context', () => ({
  useWorkspaces: () => ({ hasLoaded: true, workspaces: [{ id: 'portfolio-1', name: 'Carteira', template: 'alice-portfolio', sessions: [] }] }),
}))
vi.mock('../../tabs/store', () => ({ useWorkspace: (selector: (state: unknown) => unknown) => selector({ openOrFocus }) }))
vi.mock('../../tabs/types', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../tabs/types')>()), getFocusedTab: () => undefined }))

describe('AlicePortfolioSidebar', () => {
  it('opens portfolio/goal.md directly from the sidebar', () => {
    render(<AlicePortfolioSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Objetivo (goal.md)' }))
    expect(openOrFocus).toHaveBeenCalledWith({ kind: 'file-viewer', params: { wsId: 'portfolio-1', path: 'portfolio/goal.md', source: 'alice-portfolio' } })
  })
})
