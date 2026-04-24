import type {
  ActionReceipt,
  BridgeErrorResponse,
  DiagnosticsSummary,
  EnvironmentActionType,
  EnvironmentSnapshot,
  FailureSnapshot,
  OperationSnapshot,
} from '../contracts/environment'
import type { ActiveModal, AppRoute } from '../domain/types'

export type MockOperationPlan = {
  receipt: ActionReceipt
  operation: OperationSnapshot
  finalSnapshot: EnvironmentSnapshot
}

export type MockActionPlan =
  | {
      kind: 'success'
      value: MockOperationPlan
    }
  | {
      kind: 'error'
      status: number
      value: BridgeErrorResponse
    }

export type ContractScenarioFixture = {
  id: string
  route: AppRoute
  modal: ActiveModal
  snapshot: EnvironmentSnapshot
  actionPlans?: Partial<Record<EnvironmentActionType, MockActionPlan>>
}

const now = '2026-04-24T04:00:00.000Z'

function diagnostics(
  snapshot: EnvironmentSnapshot,
  overrides: Partial<DiagnosticsSummary> = {},
): DiagnosticsSummary {
  return {
    userSummary: {
      conclusion: snapshot.failure?.message ?? '当前运行环境状态正常。',
      recommendedNextStep:
        snapshot.failure?.suggestedRecovery === 'rebuild'
          ? '重建环境'
          : snapshot.failure?.suggestedRecovery === 'retry'
            ? '重试当前动作'
            : snapshot.failure?.suggestedRecovery === 'view_fix_instructions'
              ? '先查看修复方法'
              : '继续使用当前环境',
      retryable: snapshot.failure?.retryable ?? false,
    },
    supportSummary: {
      bridgeVersion: '1.0.0-test',
      port: 4321,
      generation: snapshot.generation,
      runtimeLocation: snapshot.runtime.location,
      lastHealthCheck: {
        status: snapshot.health.status,
        checkedAt: snapshot.health.lastCheckedAt ?? now,
        reasons: snapshot.health.reasons,
      },
      ...(snapshot.activeOperation
        ? {
            lastOperation: {
              action: snapshot.activeOperation.action,
              status: snapshot.activeOperation.status,
              operationId: snapshot.activeOperation.operationId,
              updatedAt: snapshot.activeOperation.updatedAt,
            },
          }
        : {}),
      ...(snapshot.failure
        ? {
            lastFailure: {
              stage: snapshot.failure.stage,
              type: snapshot.failure.type,
              code: snapshot.failure.code,
              occurredAt: snapshot.failure.occurredAt,
            },
          }
        : {}),
    },
    ...overrides,
  }
}

function failure(
  input: Omit<FailureSnapshot, 'occurredAt'> & { occurredAt?: string },
): FailureSnapshot {
  return {
    occurredAt: input.occurredAt ?? now,
    ...input,
  }
}

function baseSnapshot(
  overrides: Partial<EnvironmentSnapshot> = {},
): EnvironmentSnapshot {
  const snapshot: EnvironmentSnapshot = {
    environmentId: 'local-default',
    revision: 1,
    generation: 0,
    updatedAt: now,
    installation: {
      state: 'not-installed',
      installed: false,
    },
    runtime: {
      location: 'wsl2',
      processState: 'stopped',
      distroName: 'AgentSecurity',
      agentName: 'OpenClaw',
      agentVersion: '0.1.0',
    },
    checks: [],
    health: {
      status: 'unknown',
      startupFailureCount: 0,
      lastCheckedAt: now,
    },
    capabilities: {
      canRunPrecheck: true,
      canInstall: false,
      canRetry: false,
      canStart: false,
      canStop: false,
      canRestart: false,
      canRebuild: false,
      canDelete: false,
      canRequestPermission: true,
    },
    actionLocks: [],
    diagnostics: {
      userSummary: {
        conclusion: '当前尚未安装本地隔离环境。',
        recommendedNextStep: '先执行预检。',
        retryable: true,
      },
      supportSummary: {
        bridgeVersion: '1.0.0-test',
        port: 4321,
        generation: 0,
        runtimeLocation: 'wsl2',
      },
    },
  }

  const merged = {
    ...snapshot,
    ...overrides,
    installation: {
      ...snapshot.installation,
      ...overrides.installation,
    },
    runtime: {
      ...snapshot.runtime,
      ...overrides.runtime,
    },
    health: {
      ...snapshot.health,
      ...overrides.health,
    },
    capabilities: {
      ...snapshot.capabilities,
      ...overrides.capabilities,
    },
  }

  return {
    ...merged,
    diagnostics: diagnostics(merged),
  }
}

const readyChecks = [
  {
    code: 'windows_version',
    status: 'passed',
    message: 'Windows version is supported.',
    updatedAt: now,
  },
  {
    code: 'wsl_status',
    status: 'passed',
    message: 'WSL is available.',
    updatedAt: now,
  },
  {
    code: 'virtualization',
    status: 'passed',
    message: 'Virtualization is available.',
    updatedAt: now,
  },
  {
    code: 'disk_space',
    status: 'passed',
    message: 'Disk space is sufficient.',
    updatedAt: now,
  },
  {
    code: 'network',
    status: 'passed',
    message: 'Network is reachable.',
    updatedAt: now,
  },
  {
    code: 'permission',
    status: 'warning',
    message: 'Administrator approval may be required later.',
    updatedAt: now,
  },
] satisfies EnvironmentSnapshot['checks']

const entrySnapshot = baseSnapshot({})

const precheckReadySnapshot = baseSnapshot({
  revision: 2,
  updatedAt: now,
  installation: {
    state: 'ready-to-install',
    installed: false,
  },
  checks: readyChecks,
  capabilities: {
    canRunPrecheck: true,
    canInstall: true,
    canRetry: false,
    canStart: false,
    canStop: false,
    canRestart: false,
    canRebuild: false,
    canDelete: false,
    canRequestPermission: true,
  },
})

const precheckBlockedSnapshot = baseSnapshot({
  revision: 2,
  installation: {
    state: 'precheck-required',
    installed: false,
  },
  checks: [
    {
      code: 'wsl_status',
      status: 'blocked',
      message: 'WSL is not enabled on this machine.',
      detail: 'Enable WSL before continuing.',
      userAction: 'manual_fix',
      updatedAt: now,
    },
  ],
  failure: failure({
    stage: 'precheck',
    type: 'missing_capability',
    code: 'wsl_not_enabled',
    message: '当前设备尚未启用 WSL，暂时无法创建隔离环境。',
    retryable: false,
    suggestedRecovery: 'view_fix_instructions',
  }),
})

const installedSnapshot = baseSnapshot({
  revision: 4,
  generation: 1,
  installation: {
    state: 'ready',
    installed: true,
    installedAt: now,
    lastInstallAttemptAt: now,
  },
  checks: readyChecks,
  health: {
    status: 'healthy',
    startupFailureCount: 0,
    lastCheckedAt: now,
  },
  capabilities: {
    canRunPrecheck: true,
    canInstall: false,
    canRetry: false,
    canStart: true,
    canStop: false,
    canRestart: true,
    canRebuild: true,
    canDelete: true,
    canRequestPermission: true,
  },
})

const runningSnapshot = baseSnapshot({
  ...installedSnapshot,
  installation: {
    ...installedSnapshot.installation,
    state: 'running',
  },
  runtime: {
    ...installedSnapshot.runtime,
    processState: 'running',
    lastStartedAt: now,
  },
  capabilities: {
    ...installedSnapshot.capabilities,
    canStart: false,
    canStop: true,
  },
})

const installFailedSnapshot = baseSnapshot({
  revision: 4,
  installation: {
    state: 'install-failed',
    installed: false,
    lastInstallAttemptAt: now,
  },
  checks: readyChecks,
  failure: failure({
    stage: 'environment_install',
    type: 'transient',
    code: 'download_disconnected',
    message: '下载中断，安装没有完成。',
    retryable: true,
    suggestedRecovery: 'retry',
  }),
  capabilities: {
    canRunPrecheck: true,
    canInstall: false,
    canRetry: true,
    canStart: false,
    canStop: false,
    canRestart: false,
    canRebuild: true,
    canDelete: true,
    canRequestPermission: true,
  },
})

const inconsistentInstallSnapshot = baseSnapshot({
  revision: 4,
  installation: {
    state: 'install-failed',
    installed: false,
    lastInstallAttemptAt: now,
  },
  checks: readyChecks,
  failure: failure({
    stage: 'environment_install',
    type: 'environment_inconsistent',
    code: 'partial_install_state',
    message: '环境只完成了一部分，当前基线已不可信。',
    retryable: false,
    suggestedRecovery: 'rebuild',
  }),
  capabilities: {
    canRunPrecheck: true,
    canInstall: false,
    canRetry: false,
    canStart: false,
    canStop: false,
    canRestart: false,
    canRebuild: true,
    canDelete: true,
    canRequestPermission: true,
  },
})

const degradedSnapshot = baseSnapshot({
  revision: 5,
  generation: 1,
  installation: {
    state: 'degraded',
    installed: true,
    installedAt: now,
    lastInstallAttemptAt: now,
  },
  checks: readyChecks,
  health: {
    status: 'degraded',
    startupFailureCount: 3,
    lastCheckedAt: now,
    reasons: ['startup_failed_repeatedly'],
  },
  failure: failure({
    stage: 'agent_start',
    type: 'startup_failed',
    code: 'agent_start_failed',
    message: 'agent 连续启动失败，建议重建环境。',
    retryable: true,
    suggestedRecovery: 'rebuild',
  }),
  capabilities: {
    canRunPrecheck: true,
    canInstall: false,
    canRetry: false,
    canStart: true,
    canStop: false,
    canRestart: true,
    canRebuild: true,
    canDelete: true,
    canRequestPermission: true,
  },
})

const rebuildInProgressSnapshot = baseSnapshot({
  ...degradedSnapshot,
  revision: 6,
  installation: {
    ...degradedSnapshot.installation,
    state: 'rebuilding',
  },
  activeOperation: {
    operationId: 'rebuild_environment-op-1',
    action: 'rebuild_environment',
    status: 'running',
    stage: 'rebuilding',
    startedAt: now,
    updatedAt: now,
    requestedGeneration: 1,
  },
  actionLocks: [
    {
      action: 'rebuild_environment',
      reason: 'operation_in_progress',
      message: 'Another operation is already running.',
    },
    {
      action: 'delete_environment',
      reason: 'operation_in_progress',
      message: 'Another operation is already running.',
    },
  ],
})

const deleteReceipt = createReceipt('delete_environment', 1)
const rebuildReceipt = createReceipt('rebuild_environment', 1)
const installReceipt = createReceipt('install_environment', 0)
const precheckReceipt = createReceipt('run_precheck', 0)
const retryReceipt = createReceipt('retry_install', 0)

function createReceipt(
  action: EnvironmentActionType,
  generationAtAccept: number,
): ActionReceipt {
  return {
    accepted: true,
    operationId: `${action}-op-1`,
    environmentId: 'local-default',
    action,
    acceptedAt: now,
    generationAtAccept,
  }
}

function createOperation(
  action: EnvironmentActionType,
  status: OperationSnapshot['status'],
  generationAtStart: number,
  overrides: Partial<OperationSnapshot> = {},
): OperationSnapshot {
  return {
    operationId: `${action}-op-1`,
    environmentId: 'local-default',
    action,
    status,
    stage:
      action === 'run_precheck'
        ? 'precheck'
        : action === 'install_environment' || action === 'retry_install'
          ? 'installing'
          : action === 'rebuild_environment'
            ? 'rebuilding'
            : action === 'delete_environment'
              ? 'deleting'
              : 'starting',
    updatedAt: now,
    startedAt: now,
    generationAtStart,
    ...overrides,
  }
}

const precheckPlan: MockOperationPlan = {
  receipt: precheckReceipt,
  operation: createOperation('run_precheck', 'succeeded', 0, {
    completedAt: now,
    generationAtCompletion: 0,
    result: {
      snapshotRevision: 2,
      generation: 0,
    },
    progress: {
      label: 'Precheck complete',
      percent: 100,
    },
  }),
  finalSnapshot: precheckReadySnapshot,
}

const installPlan: MockOperationPlan = {
  receipt: installReceipt,
  operation: createOperation('install_environment', 'succeeded', 0, {
    completedAt: now,
    generationAtCompletion: 1,
    result: {
      snapshotRevision: 4,
      generation: 1,
    },
    progress: {
      label: 'Environment installed',
      percent: 100,
    },
  }),
  finalSnapshot: installedSnapshot,
}

const retryPlan: MockOperationPlan = {
  receipt: retryReceipt,
  operation: createOperation('retry_install', 'succeeded', 0, {
    completedAt: now,
    generationAtCompletion: 1,
    result: {
      snapshotRevision: 4,
      generation: 1,
    },
    progress: {
      label: 'Retry completed',
      percent: 100,
    },
  }),
  finalSnapshot: installedSnapshot,
}

const rebuildPlan: MockOperationPlan = {
  receipt: rebuildReceipt,
  operation: createOperation('rebuild_environment', 'succeeded', 1, {
    completedAt: now,
    generationAtCompletion: 2,
    result: {
      snapshotRevision: 7,
      generation: 2,
    },
    progress: {
      label: 'Environment rebuilt',
      percent: 100,
    },
  }),
  finalSnapshot: baseSnapshot({
    ...installedSnapshot,
    revision: 7,
    generation: 2,
  }),
}

const deletePlan: MockOperationPlan = {
  receipt: deleteReceipt,
  operation: createOperation('delete_environment', 'succeeded', 1, {
    completedAt: now,
    generationAtCompletion: 2,
    result: {
      snapshotRevision: 8,
      generation: 2,
    },
    progress: {
      label: 'Environment deleted',
      percent: 100,
    },
  }),
  finalSnapshot: baseSnapshot({
    revision: 8,
    generation: 2,
    installation: {
      state: 'not-installed',
      installed: false,
    },
    runtime: {
      location: 'wsl2',
      processState: 'stopped',
    },
    capabilities: {
      canRunPrecheck: true,
      canInstall: false,
      canRetry: false,
      canStart: false,
      canStop: false,
      canRestart: false,
      canRebuild: false,
      canDelete: false,
      canRequestPermission: true,
    },
  }),
}

function bridgeError(
  status: number,
  input: BridgeErrorResponse['error'],
): MockActionPlan {
  return {
    kind: 'error',
    status,
    value: {
      ok: false,
      error: input,
    },
  }
}

export const contractScenarioFixtures: ContractScenarioFixture[] = [
  {
    id: 'first_install_default',
    route: '/',
    modal: null,
    snapshot: entrySnapshot,
    actionPlans: {
      run_precheck: { kind: 'success', value: precheckPlan },
      install_environment: { kind: 'success', value: installPlan },
    },
  },
  {
    id: 'precheck_blocked',
    route: '/precheck',
    modal: null,
    snapshot: precheckBlockedSnapshot,
    actionPlans: {
      install_environment: bridgeError(409, {
        code: 'precheck_blocked',
        message: 'Precheck must pass before installation can start.',
        retryable: false,
        stage: 'precheck',
        type: 'missing_capability',
      }),
    },
  },
  {
    id: 'precheck_warn_continue',
    route: '/precheck',
    modal: null,
    snapshot: precheckReadySnapshot,
    actionPlans: {
      install_environment: { kind: 'success', value: installPlan },
    },
  },
  {
    id: 'install_network_failed',
    route: '/install-failed',
    modal: null,
    snapshot: installFailedSnapshot,
    actionPlans: {
      retry_install: { kind: 'success', value: retryPlan },
    },
  },
  {
    id: 'partial_install_failed',
    route: '/install-failed',
    modal: null,
    snapshot: inconsistentInstallSnapshot,
    actionPlans: {
      rebuild_environment: { kind: 'success', value: rebuildPlan },
    },
  },
  {
    id: 'degraded_after_start_failures',
    route: '/status',
    modal: null,
    snapshot: degradedSnapshot,
    actionPlans: {
      rebuild_environment: { kind: 'success', value: rebuildPlan },
      restart_agent: bridgeError(409, {
        code: 'generation_conflict',
        message: 'Current snapshot is stale. Refresh before retrying.',
        retryable: true,
        stage: 'unknown',
        type: 'generation_conflict',
      }),
    },
  },
  {
    id: 'rebuilding_in_progress',
    route: '/status',
    modal: null,
    snapshot: rebuildInProgressSnapshot,
    actionPlans: {
      delete_environment: bridgeError(409, {
        code: 'operation_in_progress',
        message: 'Another operation is already running.',
        retryable: true,
        stage: 'rebuild',
        type: 'operation_in_progress',
      }),
    },
  },
  {
    id: 'running_environment',
    route: '/status',
    modal: null,
    snapshot: runningSnapshot,
    actionPlans: {
      delete_environment: { kind: 'success', value: deletePlan },
    },
  },
]

export const contractFixturesById = Object.fromEntries(
  contractScenarioFixtures.map((fixture) => [fixture.id, fixture]),
) as Record<string, ContractScenarioFixture>

export const contractReceiptFixtures = {
  installAccepted: installReceipt,
}

export const contractOperationFixtures = {
  installPlan,
  retryPlan,
  rebuildPlan,
  deletePlan,
}
