import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { EnvironmentProvider } from './domain/machine'
import { UiStateProvider } from './ui/ui-store'

function App() {
  return (
    <UiStateProvider>
      <EnvironmentProvider>
        <RouterProvider router={router} />
      </EnvironmentProvider>
    </UiStateProvider>
  )
}

export default App
