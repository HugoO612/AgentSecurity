import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EnvironmentProvider } from '../domain/machine'
import type { ActiveModal, AppRoute, EnvironmentSnapshot } from '../domain/types'
import { UiStateProvider } from '../ui/ui-store'

export function TestProviders({
  children,
  route,
  snapshot,
  modal = null,
}: PropsWithChildren<{
  route: AppRoute
  snapshot: EnvironmentSnapshot
  modal?: ActiveModal
}>) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <UiStateProvider initialModal={modal}>
        <EnvironmentProvider initialSnapshot={snapshot}>
          <Routes>
            <Route path="*" element={children} />
          </Routes>
        </EnvironmentProvider>
      </UiStateProvider>
    </MemoryRouter>
  )
}
