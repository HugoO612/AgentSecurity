import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { DebugDrawer } from '../components/DebugDrawer'
import { ModalHost } from '../components/ModalHost'
import { copy } from '../copy'
import { warnOnBannedTerms } from '../copy/runtimeGuard'
import { getScenarioTemplate } from '../domain/mock-data'
import {
  isModalAllowed,
  isRouteCompatibleWithSnapshot,
  resolveRouteForSnapshot,
} from '../domain/selectors'
import type { AppRoute } from '../domain/types'
import { useEnvironment } from '../domain/machine'
import { useUiState } from '../ui/ui-store'
import { BridgeConnectionFailurePage } from './pages/BridgeConnectionFailurePage'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    snapshot,
    checkSummary,
    lastResult,
    pendingRoute,
    clientDiagnostics,
    consumeNavigation,
    applyScenario,
  } = useEnvironment()
  const {
    activeModal,
    setActiveModal,
    notice,
    debugPanelOpen,
    setDebugPanelOpen,
    selectedScenarioId,
  } = useUiState()
  const showDebugUi = import.meta.env.DEV

  useEffect(() => {
    warnOnBannedTerms()
  }, [])

  useEffect(() => {
    if (lastResult?.navigateTo) {
      navigate(lastResult.navigateTo, { replace: true })
      consumeNavigation()
      return
    }

    const resolved = resolveRouteForSnapshot(snapshot, checkSummary)
    const route = location.pathname as AppRoute
    if (!isRouteCompatibleWithSnapshot(route, snapshot, checkSummary, pendingRoute)) {
      navigate(resolved, { replace: true })
    }
  }, [
    checkSummary,
    consumeNavigation,
    lastResult,
    location.pathname,
    navigate,
    pendingRoute,
    snapshot,
  ])

  useEffect(() => {
    const route = location.pathname as AppRoute
    if (activeModal && !isModalAllowed(route, activeModal)) {
      setActiveModal(null)
    }
  }, [activeModal, location.pathname, setActiveModal])

  useEffect(() => {
    const scenario = getScenarioTemplate(selectedScenarioId)
    if (scenario.route !== location.pathname) {
      return
    }
    if (scenario.modal !== activeModal) {
      setActiveModal(scenario.modal)
    }
  }, [activeModal, location.pathname, selectedScenarioId, setActiveModal])

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div>
          <p className="eyebrow">Agent Security</p>
          <h1 className="shell-title">本地隔离运行</h1>
        </div>
        {showDebugUi ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setDebugPanelOpen(!debugPanelOpen)}
          >
            调试入口
          </button>
        ) : null}
      </header>
      {clientDiagnostics.mode === 'mock-fallback' ? (
        <div className="notice-banner notice-banner--warning">
          {copy('COPY_NOTICE_BRIDGE_FALLBACK')}
        </div>
      ) : null}
      {notice ? <div className="notice-banner">{notice}</div> : null}
      <div className="shell-grid">
        {clientDiagnostics.mode === 'bridge-error' &&
        clientDiagnostics.connectionFailure ? (
          <BridgeConnectionFailurePage />
        ) : (
          <Outlet />
        )}
        {showDebugUi ? (
          <DebugDrawer
            open={debugPanelOpen}
            onApplyScenario={(id) => {
              applyScenario(id)
              navigate(getScenarioTemplate(id).route)
            }}
          />
        ) : null}
      </div>
      <ModalHost />
    </div>
  )
}
