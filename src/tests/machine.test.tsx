import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createMockEnvironmentClient } from '../mocks/environment-client.mock'
import { EnvironmentProvider, useEnvironment } from '../domain/machine'
import { UiStateProvider } from '../ui/ui-store'

function RetryHarness() {
  const { snapshot, refreshSnapshot, runAction } = useEnvironment()

  return (
    <div>
      <p>{snapshot.installation.state}</p>
      <p>{snapshot.generation}</p>
      <button type="button" onClick={() => refreshSnapshot()}>
        refresh
      </button>
      <button type="button" onClick={() => runAction('retry_install')}>
        retry
      </button>
    </div>
  )
}

describe('environment machine', () => {
  it('refreshes the snapshot after a successful retry', async () => {
    const client = createMockEnvironmentClient()
    await client.debugApplyScenario?.('install_network_failed')

    render(
      <MemoryRouter initialEntries={['/install-failed']}>
        <UiStateProvider>
          <EnvironmentProvider client={client}>
            <Routes>
              <Route path="*" element={<RetryHarness />} />
            </Routes>
          </EnvironmentProvider>
        </UiStateProvider>
      </MemoryRouter>,
    )

    await screen.findByText('install-failed')
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })
})
