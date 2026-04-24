import { copy } from '../copy'
import { contractFixturesById, contractScenarioFixtures } from '../mocks/environment-contract.fixtures'
import {
  deriveAvailableActions,
  deriveCheckSummary,
  deriveEnvironmentState,
  deriveRecommendedAction,
} from './selectors'
import type {
  AppRoute,
  EnvironmentSnapshot,
  FailureInfo,
  ScenarioTemplate,
} from './types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function createInitialSnapshot() {
  return clone(contractFixturesById.first_install_default.snapshot)
}

export function createReadyToInstallSnapshot(
  overrides: Partial<Record<'disk_space' | 'network', 'warn' | 'block' | 'pass' | 'warning' | 'blocked' | 'passed'>> = {},
) {
  const snapshot = clone(contractFixturesById.precheck_warn_continue.snapshot)
  snapshot.checks = snapshot.checks.map((check) => {
    if (check.code === 'disk_space' && overrides.disk_space) {
      return { ...check, status: normalizeCheckStatus(overrides.disk_space) }
    }

    if (check.code === 'network' && overrides.network) {
      return { ...check, status: normalizeCheckStatus(overrides.network) }
    }

    return check
  })
  return snapshot
}

export function createInstalledSnapshot(_previous?: EnvironmentSnapshot) {
  void _previous
  return clone(contractFixturesById.running_environment.snapshot)
}

export function createInstallFailedSnapshot(
  type: FailureInfo['type'],
  overrides: Partial<EnvironmentSnapshot> = {},
) {
  const base =
    type === 'environment_inconsistent'
      ? contractFixturesById.partial_install_failed.snapshot
      : contractFixturesById.install_network_failed.snapshot
  return clone({
    ...base,
    failure: {
      ...(base.failure as FailureInfo),
      type,
    },
    ...overrides,
  })
}

export function createDegradedSnapshot(_type?: FailureInfo['type']) {
  void _type
  return clone(contractFixturesById.degraded_after_start_failures.snapshot)
}

export function applyStartFailure(snapshot: EnvironmentSnapshot, failure: FailureInfo) {
  const nextCount = snapshot.health.startupFailureCount + 1
  const degraded = nextCount >= 3
  const nextSnapshot: EnvironmentSnapshot = {
    ...clone(snapshot),
    updatedAt: new Date().toISOString(),
    installation: {
      ...snapshot.installation,
      state: degraded ? 'degraded' : 'stopped',
    },
    health: {
      ...snapshot.health,
      status: degraded ? 'degraded' : snapshot.health.status,
      startupFailureCount: nextCount,
    },
    failure,
  }

  return {
    ok: false as const,
    snapshot: nextSnapshot,
    error: failure,
    navigateTo: '/status' as const,
  }
}

export const statusLabelMap = {
  not_installed: 'COPY_STATUS_NOT_INSTALLED',
  precheck_required: 'COPY_STATUS_PRECHECK_REQUIRED',
  ready_to_install: 'COPY_STATUS_READY_TO_INSTALL',
  installing: 'COPY_STATUS_INSTALLING',
  install_failed: 'COPY_STATUS_INSTALL_FAILED',
  ready: 'COPY_STATUS_READY',
  starting: 'COPY_STATUS_STARTING',
  running: 'COPY_STATUS_RUNNING',
  stopped: 'COPY_STATUS_STOPPED',
  degraded: 'COPY_STATUS_DEGRADED',
  rebuilding: 'COPY_STATUS_REBUILDING',
  deleting: 'COPY_STATUS_DELETING',
} as const

export const scenarioTemplates: ScenarioTemplate[] = contractScenarioFixtures.map((fixture) => {
  const summary = deriveCheckSummary(fixture.snapshot.checks)
  const state = deriveEnvironmentState(fixture.snapshot, summary)

  return {
    id: fixture.id,
    labelKey:
      fixture.id === 'first_install_default'
        ? 'COPY_DEBUG_SCENARIO_FIRST_INSTALL'
        : fixture.id === 'precheck_blocked'
          ? 'COPY_DEBUG_SCENARIO_PRECHECK_BLOCKED'
          : fixture.id === 'precheck_warn_continue'
            ? 'COPY_DEBUG_SCENARIO_PRECHECK_WARN'
            : fixture.id === 'install_network_failed'
              ? 'COPY_DEBUG_SCENARIO_INSTALL_NETWORK_FAILED'
              : fixture.id === 'partial_install_failed'
                ? 'COPY_DEBUG_SCENARIO_PARTIAL_INSTALL'
                : fixture.id === 'degraded_after_start_failures'
                  ? 'COPY_DEBUG_SCENARIO_DEGRADED'
                  : fixture.id === 'rebuilding_in_progress'
                    ? 'COPY_DEBUG_SCENARIO_REBUILDING'
                    : 'COPY_DEBUG_SCENARIO_DELETING',
    snapshot: clone(fixture.snapshot),
    route: fixture.route,
    modal: fixture.modal,
    covers: {
      state,
      failure: fixture.snapshot.failure
        ? `${fixture.snapshot.failure.stage}:${fixture.snapshot.failure.type}`
        : 'none',
      availableActions: deriveAvailableActions(state, fixture.snapshot),
      recommendedAction: deriveRecommendedAction(fixture.snapshot, summary),
      route: fixture.route,
      modal: fixture.modal,
    },
  }
})

export function getScenarioTemplate(id: string) {
  return scenarioTemplates.find((scenario) => scenario.id === id) ?? scenarioTemplates[0]
}

export const routeOrder: AppRoute[] = [
  '/',
  '/preinstall',
  '/precheck',
  '/installing',
  '/install-failed',
  '/status',
  '/recovery',
]

export function getScenarioLabel(id: string) {
  return copy(getScenarioTemplate(id).labelKey)
}

function normalizeCheckStatus(status: 'warn' | 'block' | 'pass' | 'warning' | 'blocked' | 'passed') {
  if (status === 'warn') {
    return 'warning'
  }

  if (status === 'block') {
    return 'blocked'
  }

  if (status === 'pass') {
    return 'passed'
  }

  return status
}
