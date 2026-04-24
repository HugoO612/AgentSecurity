import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BridgeErrorResponse, EnvironmentSnapshot, FailureSnapshot, OperationSnapshot, ActionRequest } from '../src/contracts/environment.ts'
import type { BridgeConfig } from './config.ts'
import { buildPrecheck } from './precheck.ts'
import { withDiagnostics } from './sample-payloads.ts'

type PlannedAction =
  | {
      receiptStatus: 202
      receipt: {
        accepted: true
        operationId: string
        environmentId: 'local-default'
        action: ActionRequest['action']
        acceptedAt: string
        generationAtAccept: number
      }
      runningSnapshot: EnvironmentSnapshot
      finalSnapshot: EnvironmentSnapshot
      runningRecord: OperationSnapshot
      finalRecord: OperationSnapshot
      pollsRemaining: number
    }
  | {
      receiptStatus: 409 | 400
      error: BridgeErrorResponse
    }

export async function planActionExecution(
  request: ActionRequest,
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  if (snapshot.activeOperation) {
    return rejectAction(409, {
      code: 'operation_in_progress',
      message: 'Another operation is already running.',
      retryable: true,
      stage: 'unknown',
      type: 'operation_in_progress',
    })
  }

  if (
    request.expectedGeneration !== undefined &&
    request.expectedGeneration !== snapshot.generation
  ) {
    return rejectAction(409, {
      code: 'generation_conflict',
      message: 'The current snapshot generation changed.',
      retryable: true,
      stage: 'unknown',
      type: 'generation_conflict',
    })
  }

  switch (request.action) {
    case 'run_precheck':
      return planPrecheck(snapshot, config)
    case 'install_environment':
      return planInstall(snapshot, config, false)
    case 'retry_install':
      return planInstall(snapshot, config, true)
    case 'request_permission':
      return planPermission(snapshot, config)
    case 'start_agent':
      return planStart(snapshot, config)
    case 'stop_agent':
      return planStop(snapshot, config)
    case 'restart_agent':
      return planRestart(snapshot, config)
    case 'rebuild_environment':
      return planRebuild(snapshot, config)
    case 'delete_environment':
      return planDelete(snapshot, config)
  }
}

async function planPrecheck(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  const operationId = randomUUID()
  const now = new Date().toISOString()
  const precheck = await buildPrecheck(config)
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'run_precheck',
    operationId,
    now,
    'precheck',
    config,
  )
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      installation: {
        ...snapshot.installation,
        state: precheck.failure ? 'precheck-required' : 'ready-to-install',
        installed: false,
      },
      checks: precheck.checks,
      failure: precheck.failure,
      health: {
        ...snapshot.health,
        lastCheckedAt: now,
      },
      capabilities: deriveCapabilities({
        ...snapshot,
        installation: {
          ...snapshot.installation,
          state: precheck.failure ? 'precheck-required' : 'ready-to-install',
          installed: false,
        },
        failure: precheck.failure,
      }),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'run_precheck',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'precheck',
    progressLabel: 'Precheck complete',
  })
}

async function planInstall(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
  isRetry: boolean,
): Promise<PlannedAction> {
  const allowed =
    snapshot.installation.state === 'ready-to-install' ||
    (isRetry &&
      snapshot.installation.state === 'install-failed' &&
      snapshot.failure?.retryable)

  if (!allowed) {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'The requested install action is not available.',
      retryable: false,
      stage: 'environment_install',
      type: 'state_conflict',
    })
  }

  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    isRetry ? 'retry_install' : 'install_environment',
    operationId,
    now,
    'installing',
    config,
  )
  const precheck = await buildPrecheck(config)

  let finalSnapshot: EnvironmentSnapshot
  let success = false
  let failure: FailureSnapshot | undefined

  if (precheck.failure) {
    failure = {
      stage: 'environment_install',
      type: 'transient',
      code: precheck.failure.code,
      message: '安装前置条件仍未满足，当前安装没有完成。',
      detail: precheck.failure.detail,
      retryable: true,
      occurredAt: now,
      suggestedRecovery: 'retry',
    }
    finalSnapshot = finalizeSnapshot(
      {
        ...snapshot,
        revision: snapshot.revision + 2,
        updatedAt: now,
        installation: {
          ...snapshot.installation,
          state: 'install-failed',
          installed: false,
          lastInstallAttemptAt: now,
        },
        checks: precheck.checks,
        failure,
        capabilities: deriveCapabilities({
          ...snapshot,
          installation: {
            ...snapshot.installation,
            state: 'install-failed',
            installed: false,
          },
          failure,
        }),
        activeOperation: undefined,
        actionLocks: [],
      },
      config,
    )
  } else {
    const nextGeneration = snapshot.generation + 1
    await mkdir(join(config.runtimeDir, `generation-${nextGeneration}`), {
      recursive: true,
    })
    await writeFile(
      join(config.runtimeDir, `generation-${nextGeneration}`, 'installed.txt'),
      'installed\n',
      'utf8',
    )
    finalSnapshot = finalizeSnapshot(
      {
        ...snapshot,
        revision: snapshot.revision + 2,
        generation: nextGeneration,
        updatedAt: now,
        installation: {
          state: 'ready',
          installed: true,
          installedAt: snapshot.installation.installedAt ?? now,
          lastInstallAttemptAt: now,
        },
        runtime: {
          ...snapshot.runtime,
          processState: 'stopped',
        },
        checks: precheck.checks,
        failure: undefined,
        health: {
          status: 'healthy',
          startupFailureCount: 0,
          lastCheckedAt: now,
        },
        capabilities: deriveCapabilities({
          ...snapshot,
          installation: {
            state: 'ready',
            installed: true,
          },
          failure: undefined,
        } as EnvironmentSnapshot),
        activeOperation: undefined,
        actionLocks: [],
      },
      config,
    )
    success = true
  }

  return createPlannedOperation({
    action: isRetry ? 'retry_install' : 'install_environment',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success,
    failure,
    stage: 'installing',
    progressLabel: success ? 'Environment installed' : 'Install failed',
  })
}

async function planPermission(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'request_permission',
    operationId,
    now,
    'validating',
    config,
  )
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      failure: undefined,
      capabilities: deriveCapabilities(snapshot),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'request_permission',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'validating',
    progressLabel: 'Permission recorded',
  })
}

async function planStart(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  if (!['ready', 'stopped', 'degraded'].includes(snapshot.installation.state)) {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'The environment cannot be started right now.',
      retryable: false,
      stage: 'agent_start',
      type: 'state_conflict',
    })
  }

  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'start_agent',
    operationId,
    now,
    'starting',
    config,
  )
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      installation: {
        ...snapshot.installation,
        state: 'running',
      },
      runtime: {
        ...snapshot.runtime,
        processState: 'running',
        lastStartedAt: now,
      },
      health: {
        status: 'healthy',
        startupFailureCount: 0,
        lastCheckedAt: now,
      },
      failure: undefined,
      capabilities: deriveCapabilities({
        ...snapshot,
        installation: {
          ...snapshot.installation,
          state: 'running',
        },
      } as EnvironmentSnapshot),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'start_agent',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'starting',
    progressLabel: 'Agent started',
  })
}

async function planStop(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  if (snapshot.installation.state !== 'running') {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'The environment is not running.',
      retryable: false,
      stage: 'agent_stop',
      type: 'state_conflict',
    })
  }

  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'stop_agent',
    operationId,
    now,
    'stopping',
    config,
  )
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      installation: {
        ...snapshot.installation,
        state: 'stopped',
      },
      runtime: {
        ...snapshot.runtime,
        processState: 'stopped',
        lastStoppedAt: now,
      },
      capabilities: deriveCapabilities({
        ...snapshot,
        installation: {
          ...snapshot.installation,
          state: 'stopped',
        },
      } as EnvironmentSnapshot),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'stop_agent',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'stopping',
    progressLabel: 'Agent stopped',
  })
}

async function planRestart(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  if (!['ready', 'running', 'stopped', 'degraded'].includes(snapshot.installation.state)) {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'The environment cannot be restarted right now.',
      retryable: false,
      stage: 'agent_start',
      type: 'state_conflict',
    })
  }

  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'restart_agent',
    operationId,
    now,
    'starting',
    config,
  )
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      installation: {
        ...snapshot.installation,
        state: 'running',
      },
      runtime: {
        ...snapshot.runtime,
        processState: 'running',
        lastStartedAt: now,
      },
      health: {
        status: 'healthy',
        startupFailureCount: 0,
        lastCheckedAt: now,
      },
      failure: undefined,
      capabilities: deriveCapabilities({
        ...snapshot,
        installation: {
          ...snapshot.installation,
          state: 'running',
        },
      } as EnvironmentSnapshot),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'restart_agent',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'starting',
    progressLabel: 'Agent restarted',
  })
}

async function planRebuild(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  if (!['ready', 'running', 'stopped', 'degraded', 'install-failed'].includes(snapshot.installation.state)) {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'The environment cannot be rebuilt right now.',
      retryable: false,
      stage: 'rebuild',
      type: 'state_conflict',
    })
  }

  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'rebuild_environment',
    operationId,
    now,
    'rebuilding',
    config,
  )
  const nextGeneration = snapshot.generation + 1
  await mkdir(join(config.runtimeDir, `generation-${nextGeneration}`), { recursive: true })
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      generation: nextGeneration,
      updatedAt: now,
      installation: {
        state: 'ready',
        installed: true,
        installedAt: now,
        lastInstallAttemptAt: now,
      },
      runtime: {
        ...snapshot.runtime,
        processState: 'stopped',
      },
      health: {
        status: 'healthy',
        startupFailureCount: 0,
        lastCheckedAt: now,
      },
      failure: undefined,
      capabilities: deriveCapabilities({
        ...snapshot,
        installation: {
          state: 'ready',
          installed: true,
        },
      } as EnvironmentSnapshot),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'rebuild_environment',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'rebuilding',
    progressLabel: 'Environment rebuilt',
  })
}

async function planDelete(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  if (!['ready', 'running', 'stopped', 'degraded', 'install-failed'].includes(snapshot.installation.state)) {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'The environment cannot be deleted right now.',
      retryable: false,
      stage: 'delete',
      type: 'state_conflict',
    })
  }

  const operationId = randomUUID()
  const now = new Date().toISOString()
  const runningSnapshot = createRunningSnapshot(
    snapshot,
    'delete_environment',
    operationId,
    now,
    'deleting',
    config,
  )
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      generation: snapshot.generation + 1,
      updatedAt: now,
      installation: {
        state: 'not-installed',
        installed: false,
      },
      runtime: {
        ...snapshot.runtime,
        processState: 'stopped',
        lastStoppedAt: now,
      },
      checks: [],
      health: {
        status: 'unknown',
        startupFailureCount: 0,
        lastCheckedAt: now,
      },
      failure: undefined,
      capabilities: deriveCapabilities({
        ...snapshot,
        installation: {
          state: 'not-installed',
          installed: false,
        },
        failure: undefined,
      } as EnvironmentSnapshot),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )

  return createPlannedOperation({
    action: 'delete_environment',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: true,
    stage: 'deleting',
    progressLabel: 'Environment deleted',
  })
}

function createRunningSnapshot(
  snapshot: EnvironmentSnapshot,
  action: ActionRequest['action'],
  operationId: string,
  now: string,
  stage: OperationSnapshot['stage'],
  config: BridgeConfig,
) {
  return withDiagnostics(
    {
      ...snapshot,
      revision: snapshot.revision + 1,
      updatedAt: now,
      activeOperation: {
        operationId,
        action,
        status: 'running',
        stage,
        startedAt: now,
        updatedAt: now,
        requestedGeneration: snapshot.generation,
      },
      actionLocks: [
        {
          action: 'install_environment',
          reason: 'operation_in_progress',
          message: 'Another operation is already running.',
        },
        {
          action: 'retry_install',
          reason: 'operation_in_progress',
          message: 'Another operation is already running.',
        },
        {
          action: 'start_agent',
          reason: 'operation_in_progress',
          message: 'Another operation is already running.',
        },
        {
          action: 'stop_agent',
          reason: 'operation_in_progress',
          message: 'Another operation is already running.',
        },
        {
          action: 'restart_agent',
          reason: 'operation_in_progress',
          message: 'Another operation is already running.',
        },
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
    },
    config,
  )
}

function finalizeSnapshot(snapshot: EnvironmentSnapshot, config: BridgeConfig) {
  return withDiagnostics(
    {
      ...snapshot,
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )
}

function createPlannedOperation(input: {
  action: ActionRequest['action']
  snapshot: EnvironmentSnapshot
  runningSnapshot: EnvironmentSnapshot
  finalSnapshot: EnvironmentSnapshot
  operationId: string
  success: boolean
  failure?: FailureSnapshot
  stage: OperationSnapshot['stage']
  progressLabel: string
}): PlannedAction {
  return {
    receiptStatus: 202,
    receipt: {
      accepted: true,
      operationId: input.operationId,
      environmentId: input.snapshot.environmentId,
      action: input.action,
      acceptedAt: input.runningSnapshot.updatedAt,
      generationAtAccept: input.snapshot.generation,
    },
    runningSnapshot: input.runningSnapshot,
    finalSnapshot: input.finalSnapshot,
    runningRecord: {
      operationId: input.operationId,
      environmentId: input.snapshot.environmentId,
      action: input.action,
      status: 'running',
      stage: input.stage,
      startedAt: input.runningSnapshot.updatedAt,
      updatedAt: input.runningSnapshot.updatedAt,
      generationAtStart: input.snapshot.generation,
      progress: {
        label: 'Operation in progress',
        percent: 30,
      },
    },
    finalRecord: {
      operationId: input.operationId,
      environmentId: input.snapshot.environmentId,
      action: input.action,
      status: input.success ? 'succeeded' : 'failed',
      stage: input.stage,
      startedAt: input.runningSnapshot.updatedAt,
      updatedAt: input.finalSnapshot.updatedAt,
      completedAt: input.finalSnapshot.updatedAt,
      generationAtStart: input.snapshot.generation,
      generationAtCompletion: input.finalSnapshot.generation,
      result: {
        snapshotRevision: input.finalSnapshot.revision,
        generation: input.finalSnapshot.generation,
      },
      progress: {
        label: input.progressLabel,
        percent: 100,
      },
      error: input.failure,
    },
    pollsRemaining: 1,
  }
}

function rejectAction(
  status: 409 | 400,
  error: BridgeErrorResponse['error'],
): PlannedAction {
  return {
    receiptStatus: status,
    error: {
      ok: false,
      error,
    },
  }
}

function deriveCapabilities(snapshot: EnvironmentSnapshot): EnvironmentSnapshot['capabilities'] {
  const state = snapshot.installation.state
  return {
    canRunPrecheck: true,
    canInstall: state === 'ready-to-install',
    canRetry: state === 'install-failed' && Boolean(snapshot.failure?.retryable),
    canStart: state === 'ready' || state === 'stopped' || state === 'degraded',
    canStop: state === 'running',
    canRestart: ['ready', 'running', 'stopped', 'degraded'].includes(state),
    canRebuild: ['ready', 'running', 'stopped', 'degraded', 'install-failed'].includes(state),
    canDelete: ['ready', 'running', 'stopped', 'degraded', 'install-failed'].includes(state),
    canRequestPermission: true,
  }
}
