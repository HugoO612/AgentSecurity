import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './shell'
import { EntryPage } from './pages/EntryPage'
import { InstallFailedPage } from './pages/InstallFailedPage'
import { InstallingPage } from './pages/InstallingPage'
import { PrecheckPage } from './pages/PrecheckPage'
import { PreinstallPage } from './pages/PreinstallPage'
import { RecoveryPage } from './pages/RecoveryPage'
import { StatusPage } from './pages/StatusPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <EntryPage /> },
      { path: 'preinstall', element: <PreinstallPage /> },
      { path: 'precheck', element: <PrecheckPage /> },
      { path: 'installing', element: <InstallingPage /> },
      { path: 'install-failed', element: <InstallFailedPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: 'recovery', element: <RecoveryPage /> },
    ],
  },
])
