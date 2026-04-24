import type {
  ActiveModal,
  AppRoute,
  CheckSummary,
  EnvironmentAction,
  EnvironmentSnapshot,
  EnvironmentState,
  StatusTone,
} from './types'

export function deriveCheckSummary(checks: EnvironmentSnapshot['checks']): CheckSummary {
  const blockCount = checks.filter((item) => item.status === 'blocked').length
  const warnCount = checks.filter((item) => item.status === 'warning').length
  const passCount = checks.filter((item) => item.status === 'passed').length
  const requiredResolved = checks.every(
    (item) => item.status !== 'checking' && item.status !== 'unknown',
  )

  return {
    blockCount,
    warnCount,
    passCount,
    requiredResolved,
    hasChecks: checks.length > 0,
  }
}

export function deriveEnvironmentState(
  snapshot: EnvironmentSnapshot,
  checkSummary: CheckSummary,
): EnvironmentState {
  if (snapshot.activeOperation?.status === 'running') {
    if (
      snapshot.activeOperation.action === 'installer' ||
      snapshot.activeOperation.action === 'install_environment' ||
      snapshot.activeOperation.action === 'retry_install' ||
      snapshot.activeOperation.action === 'request_permission'
    ) {
      return 'installing'
    }

    if (snapshot.activeOperation.action === 'rebuild_environment') {
      return 'rebuilding'
    }

    if (snapshot.activeOperation.action === 'delete_environment') {
      return 'deleting'
    }

    if (
      snapshot.activeOperation.action === 'start_agent' ||
      snapshot.activeOperation.action === 'restart_agent'
    ) {
      return 'starting'
    }
  }

  switch (snapshot.installation.state) {
    case 'not-installed':
      return 'not_installed'
    case 'precheck-required':
      return checkSummary.blockCount > 0 ? 'precheck_required' : 'precheck_required'
    case 'ready-to-install':
      return 'ready_to_install'
    case 'installing':
      return 'installing'
    case 'install-failed':
      return 'install_failed'
    case 'ready':
      return 'ready'
    case 'starting':
      return 'starting'
    case 'running':
      return 'running'
    case 'stopped':
      return 'stopped'
    case 'degraded':
      return 'degraded'
    case 'rebuilding':
      return 'rebuilding'
    case 'deleting':
      return 'deleting'
  }
}

export function deriveAvailableActions(
  state: EnvironmentState,
  snapshot: EnvironmentSnapshot,
): EnvironmentAction[] {
  if (snapshot.activeOperation) {
    return []
  }

  if (snapshot.failure && snapshot.recovery?.availableActions?.length) {
    const mapped = snapshot.recovery.availableActions
      .map((action) => {
        if (action === 'retry') {
          return 'retry_install'
        }
        if (action === 'rebuild') {
          return 'rebuild_environment'
        }
        if (action === 'delete') {
          return 'delete_environment'
        }
        return null
      })
      .filter(
        (
          action,
        ): action is Extract<
          EnvironmentAction,
          'retry_install' | 'rebuild_environment' | 'delete_environment'
        > => action !== null,
      )
    if (mapped.length > 0) {
      return filterLockedActions(mapped, snapshot)
    }
  }

  if (state === 'ready') {
    return filterLockedActions(
      ['start_agent', 'restart_agent', 'rebuild_environment', 'delete_environment'],
      snapshot,
    )
  }

  if (state === 'running') {
    return filterLockedActions(
      ['stop_agent', 'restart_agent', 'rebuild_environment', 'delete_environment'],
      snapshot,
    )
  }

  if (state === 'stopped') {
    return filterLockedActions(
      ['start_agent', 'restart_agent', 'rebuild_environment', 'delete_environment'],
      snapshot,
    )
  }

  if (state === 'degraded') {
    return filterLockedActions(
      ['restart_agent', 'rebuild_environment', 'delete_environment'],
      snapshot,
    )
  }

  if (state === 'install_failed') {
    const base = deriveRecommendedAction(snapshot, deriveCheckSummary(snapshot.checks))
    const actions: EnvironmentAction[] = []

    if (base === 'retry_install') {
      actions.push('retry_install')
    }

    if (base === 'rebuild_environment') {
      actions.push('rebuild_environment')
    }

    if (base === 'view_fix_instructions') {
      actions.push('view_fix_instructions')
    }

    actions.push('delete_environment')
    return filterLockedActions(actions, snapshot)
  }

  return []
}

export function deriveRecommendedAction(
  snapshot: EnvironmentSnapshot,
  checkSummary: CheckSummary,
): EnvironmentAction | undefined {
  const recovery = snapshot.recovery
  if (recovery?.recommendedAction) {
    if (recovery.recommendedAction === 'retry') {
      return 'retry_install'
    }
    if (recovery.recommendedAction === 'rebuild') {
      return 'rebuild_environment'
    }
    if (recovery.recommendedAction === 'delete') {
      return 'delete_environment'
    }
    if (recovery.recommendedAction === 'go_fix') {
      return 'view_fix_instructions'
    }
  }

  const state = deriveEnvironmentState(snapshot, checkSummary)
  const failure = snapshot.failure

  if (failure?.type === 'generation_conflict') {
    return 'refresh_snapshot'
  }

  if (failure?.stage === 'precheck') {
    if (failure.type === 'missing_capability' || failure.type === 'permission_required') {
      return 'view_fix_instructions'
    }
  }

  if (failure?.stage === 'environment_install' || failure?.stage === 'agent_install') {
    if (failure.type === 'transient' || failure.retryable) {
      return 'retry_install'
    }

    if (failure.type === 'environment_inconsistent') {
      return 'rebuild_environment'
    }
  }

  if (failure?.stage === 'agent_start' || failure?.stage === 'health_check') {
    if (failure.type === 'startup_failed') {
      return snapshot.health.startupFailureCount >= 3
        ? 'rebuild_environment'
        : 'restart_agent'
    }

    if (failure.type === 'degraded_state') {
      return 'rebuild_environment'
    }
  }

  if (failure?.stage === 'delete' && failure.type === 'transient') {
    return 'retry_install'
  }

  if (state === 'ready' || state === 'stopped') {
    return 'start_agent'
  }

  if (state === 'running') {
    return 'stop_agent'
  }

  if (state === 'degraded') {
    return snapshot.health.startupFailureCount >= 3
      ? 'rebuild_environment'
      : 'restart_agent'
  }

  return undefined
}

export function deriveStatusTone(
  state: EnvironmentState,
  snapshot: EnvironmentSnapshot,
): StatusTone {
  if (state === 'running' || state === 'ready' || state === 'stopped') {
    return 'positive'
  }

  if (state === 'install_failed' || state === 'degraded') {
    return 'critical'
  }

  if (
    state === 'precheck_required' &&
    deriveCheckSummary(snapshot.checks).warnCount > 0
  ) {
    return 'warning'
  }

  return 'neutral'
}

export function resolveRouteForSnapshot(
  snapshot: EnvironmentSnapshot,
  checkSummary: CheckSummary,
): AppRoute {
  if (
    snapshot.installation.state === 'not-installed' &&
    (snapshot.deleteSummary?.deletedItems.length ?? 0) > 0
  ) {
    return '/delete-complete'
  }

  const state = deriveEnvironmentState(snapshot, checkSummary)

  switch (state) {
    case 'not_installed':
      return '/'
    case 'precheck_required':
    case 'ready_to_install':
      return '/precheck'
    case 'installing':
      return '/installing'
    case 'ready':
    case 'starting':
    case 'running':
    case 'stopped':
    case 'degraded':
    case 'rebuilding':
    case 'deleting':
      return '/status'
    case 'install_failed':
      return '/install-failed'
  }
}

export function isRouteCompatibleWithSnapshot(
  route: AppRoute,
  snapshot: EnvironmentSnapshot,
  checkSummary: CheckSummary,
  pendingRoute?: AppRoute | null,
) {
  if (pendingRoute && route === pendingRoute) {
    return true
  }

  const resolved = resolveRouteForSnapshot(snapshot, checkSummary)
  if (route === resolved) {
    return true
  }

  if (route === '/preinstall') {
    return deriveEnvironmentState(snapshot, checkSummary) === 'not_installed'
  }

  if (route === '/recovery') {
    const availableActions = deriveAvailableActions(
      deriveEnvironmentState(snapshot, checkSummary),
      snapshot,
    )
    return Boolean(snapshot.failure) || availableActions.length > 0
  }

  if (route === '/install-complete') {
    const state = deriveEnvironmentState(snapshot, checkSummary)
    return ['ready', 'running', 'stopped', 'degraded'].includes(state)
  }

  if (route === '/delete-complete') {
    return (
      snapshot.installation.state === 'not-installed' &&
      (snapshot.deleteSummary?.deletedItems.length ?? 0) > 0
    )
  }

  return false
}

export function isModalAllowed(route: AppRoute, modal: ActiveModal) {
  if (modal === null) {
    return true
  }

  const allowedRoutes: Record<Exclude<ActiveModal, null>, AppRoute[]> = {
    permission_confirm: ['/installing', '/install-failed', '/recovery'],
    rebuild_confirm: ['/status', '/recovery', '/install-failed'],
    delete_confirm: ['/status', '/recovery', '/install-failed'],
  }

  return allowedRoutes[modal].includes(route)
}

function filterLockedActions(
  actions: EnvironmentAction[],
  snapshot: EnvironmentSnapshot,
) {
  const locked = new Set(snapshot.actionLocks?.map((item) => item.action) ?? [])
  return actions.filter(
    (action) => action === 'view_fix_instructions' || action === 'refresh_snapshot' || !locked.has(action),
  )
}
