import { randomUUID } from 'node:crypto'
import type {
  ActionReceipt,
  ActionRequest,
  BridgeErrorResponse,
  CommandAuditSummary,
  EnvironmentActionType,
  EnvironmentSnapshot,
  FailureSnapshot,
  OperationSnapshot,
} from '../src/contracts/environment.ts'
import type { BridgeConfig } from './config.ts'
import { buildPrecheck } from './precheck.ts'
import { buildDeleteResultReport } from './report-builder.ts'
import { withDiagnostics } from './sample-payloads.ts'
import {
  runTemplateCommand,
  type TemplateCommandId,
  type TemplatedAction,
} from './command-runner.ts'

type PlannedAction =
  | {
      receiptStatus: 202
      receipt: ActionReceipt
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

type ActionExecutionSuccess = {
  ok: true
  stage: OperationSnapshot['stage']
  audits: CommandAuditSummary[]
}

type ActionExecutionFailure = {
  ok: false
  stage: OperationSnapshot['stage']
  failure: FailureSnapshot
  audits: CommandAuditSummary[]
}

type ActionExecutionResult = ActionExecutionSuccess | ActionExecutionFailure

type ActionCommandPlan = {
  command: TemplateCommandId
  stage: OperationSnapshot['stage']
}

export async function planActionExecution(
  request: ActionRequest,
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  const validation = validateActionRequest(request, snapshot)
  if (validation) {
    return validation
  }

  switch (request.action) {
    case 'run_precheck':
      return planPrecheck(snapshot, config)
    case 'install_environment':
      return planFormalInstaller(snapshot, config, false)
    case 'retry_install':
      return planFormalInstaller(snapshot, config, true)
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

export async function planInstallerExecution(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): Promise<PlannedAction> {
  const validation = validateInstallerStart(snapshot)
  if (validation) {
    return validation
  }

  return planFormalInstaller(snapshot, config, false, true)
}

function validateActionRequest(
  request: ActionRequest,
  snapshot: EnvironmentSnapshot,
): PlannedAction | null {
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

  return null
}

function validateInstallerStart(snapshot: EnvironmentSnapshot): PlannedAction | null {
  if (snapshot.activeOperation) {
    return rejectAction(409, {
      code: 'operation_in_progress',
      message: 'Another operation is already running.',
      retryable: true,
      stage: 'unknown',
      type: 'operation_in_progress',
    })
  }

  if (!['not-installed', 'precheck-required', 'ready-to-install', 'install-failed'].includes(snapshot.installation.state)) {
    return rejectAction(409, {
      code: 'action_not_available',
      message: 'Installer cannot start from the current state.',
      retryable: false,
      stage: 'environment_install',
      type: 'state_conflict',
    })
  }

  return null
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
  const nextState = precheck.failure ? 'precheck-required' : 'ready-to-install'
  const finalSnapshot = finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      installation: {
        ...snapshot.installation,
        state: nextState,
        installed: false,
      },
      checks: precheck.checks,
      failure: precheck.failure,
      health: {
        ...snapshot.health,
        lastCheckedAt: now,
      },
      capabilities: deriveCapabilities(nextState, Boolean(precheck.failure)),
      recovery: deriveRecoveryModel({
        snapshot,
        installationState: nextState,
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
    runningStage: 'precheck',
    finalStage: 'finalizing',
    progressLabel: 'Precheck complete',
  })
}

async function planFormalInstaller(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
  isRetry: boolean,
  useInstallerAction = false,
): Promise<PlannedAction> {
  const operationId = randomUUID()
  const now = new Date().toISOString()
  const action: EnvironmentActionType | 'installer' = useInstallerAction
    ? 'installer'
    : isRetry
      ? 'retry_install'
      : 'install_environment'

  const runningSnapshot = createRunningSnapshot(
    snapshot,
    action,
    operationId,
    now,
    'collecting_facts',
    config,
  )

  const execution = await executeActionPlan(
    useInstallerAction ? 'installer' : isRetry ? 'retry_install' : 'install_environment',
    operationId,
    config,
    createInstallerPlan(isRetry),
  )

  const finalSnapshot = execution.ok
    ? buildInstallerSuccessSnapshot(snapshot, config, now, execution.audits)
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        'install-failed',
        execution.audits,
      )

  return createPlannedOperation({
    action,
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'collecting_facts',
    finalStage: execution.ok ? 'completed' : execution.stage,
    progressLabel: execution.ok ? 'Installer completed' : 'Installer failed',
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
    'awaiting_permission',
    config,
  )
  const execution = await executeActionPlan('request_permission', operationId, config, [
    { command: 'enable_wsl_optional_features', stage: 'awaiting_permission' },
  ])

  const finalSnapshot = execution.ok
    ? finalizeSnapshot(
        {
          ...snapshot,
          revision: snapshot.revision + 2,
          updatedAt: now,
          failure: undefined,
          recovery: deriveRecoveryModel({
            snapshot,
            installationState: snapshot.installation.state,
            failure: undefined,
          }),
          activeOperation: undefined,
          actionLocks: [],
        },
        config,
      )
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        snapshot.installation.state,
        execution.audits,
      )

  return createPlannedOperation({
    action: 'request_permission',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'awaiting_permission',
    finalStage: execution.ok ? 'finalizing' : execution.stage,
    progressLabel: execution.ok ? 'Permission request recorded' : 'Permission request failed',
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
    'starting_bridge',
    config,
  )
  const execution = await executeActionPlan('start_agent', operationId, config, [
    { command: 'check_distro', stage: 'check_distro' },
    { command: 'start_agent', stage: 'starting_bridge' },
    { command: 'health_check', stage: 'verifying_install' },
  ])

  const finalSnapshot = execution.ok
    ? finalizeSnapshot(
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
          commandAudits: appendCommandAudits(snapshot.commandAudits, execution.audits),
          capabilities: deriveCapabilities('running', false),
          recovery: deriveRecoveryModel({
            snapshot,
            installationState: 'running',
            failure: undefined,
          }),
          activeOperation: undefined,
          actionLocks: [],
        },
        config,
      )
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        'degraded',
        execution.audits,
      )

  return createPlannedOperation({
    action: 'start_agent',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'starting_bridge',
    finalStage: execution.ok ? 'finalizing' : execution.stage,
    progressLabel: execution.ok ? 'Agent started' : 'Agent failed to start',
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
  const execution = await executeActionPlan('stop_agent', operationId, config, [
    { command: 'check_distro', stage: 'check_distro' },
    { command: 'stop_agent', stage: 'stopping' },
  ])

  const finalSnapshot = execution.ok
    ? finalizeSnapshot(
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
          failure: undefined,
          commandAudits: appendCommandAudits(snapshot.commandAudits, execution.audits),
          capabilities: deriveCapabilities('stopped', false),
          recovery: deriveRecoveryModel({
            snapshot,
            installationState: 'stopped',
            failure: undefined,
          }),
          activeOperation: undefined,
          actionLocks: [],
        },
        config,
      )
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        snapshot.installation.state,
        execution.audits,
      )

  return createPlannedOperation({
    action: 'stop_agent',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'stopping',
    finalStage: execution.ok ? 'finalizing' : execution.stage,
    progressLabel: execution.ok ? 'Agent stopped' : 'Agent stop failed',
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
    'starting_bridge',
    config,
  )
  const execution = await executeActionPlan('restart_agent', operationId, config, [
    { command: 'check_distro', stage: 'check_distro' },
    { command: 'stop_agent', stage: 'stopping' },
    { command: 'start_agent', stage: 'starting_bridge' },
    { command: 'health_check', stage: 'verifying_install' },
  ])

  const finalSnapshot = execution.ok
    ? finalizeSnapshot(
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
          commandAudits: appendCommandAudits(snapshot.commandAudits, execution.audits),
          capabilities: deriveCapabilities('running', false),
          recovery: deriveRecoveryModel({
            snapshot,
            installationState: 'running',
            failure: undefined,
          }),
          activeOperation: undefined,
          actionLocks: [],
        },
        config,
      )
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        'degraded',
        execution.audits,
      )

  return createPlannedOperation({
    action: 'restart_agent',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'starting_bridge',
    finalStage: execution.ok ? 'finalizing' : execution.stage,
    progressLabel: execution.ok ? 'Agent restarted' : 'Restart failed',
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
    'cleanup_environment',
    config,
  )
  const execution = await executeActionPlan('rebuild_environment', operationId, config, [
    { command: 'check_distro', stage: 'check_distro' },
    { command: 'stop_agent', stage: 'stopping' },
    { command: 'cleanup_environment', stage: 'cleanup_environment' },
    { command: 'download_installer', stage: 'installing_agent' },
    { command: 'verify_checksum', stage: 'installing_agent' },
    { command: 'install_agent', stage: 'installing_agent' },
    { command: 'write_runtime_config', stage: 'writing_config' },
    { command: 'start_agent', stage: 'starting_bridge' },
    { command: 'health_check', stage: 'verifying_install' },
    { command: 'collect_environment_report', stage: 'completed' },
  ])

  const finalSnapshot = execution.ok
    ? buildInstallerSuccessSnapshot(snapshot, config, now, execution.audits, snapshot.generation + 1)
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        'install-failed',
        execution.audits,
      )

  return createPlannedOperation({
    action: 'rebuild_environment',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'cleanup_environment',
    finalStage: execution.ok ? 'completed' : execution.stage,
    progressLabel: execution.ok ? 'Environment rebuilt' : 'Rebuild failed',
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
  const execution = await executeActionPlan('delete_environment', operationId, config, [
    { command: 'check_distro', stage: 'check_distro' },
    { command: 'stop_agent', stage: 'stopping' },
    { command: 'delete_environment_files', stage: 'deleting' },
    { command: 'delete_verification', stage: 'deleting' },
    { command: 'collect_environment_report', stage: 'completed' },
  ])

  const deleteSummary = {
    deletedItems: [
      `Dedicated distro placeholder for ${config.targetDistro}`,
      'Runtime configuration',
      'Bridge runtime state',
    ],
    remainingItems: [
      config.dataRoot,
      config.diagnosticsDir,
      config.reportDir,
    ],
    windowsHostResidualSummary:
      '已删除隔离环境运行态与专用 distro 占位数据；保留受控数据、日志和报告目录供支持排查。',
  }
  const deleteReport = buildDeleteResultReport({
    ...snapshot,
    installation: {
      state: 'not-installed',
      installed: false,
    },
    deleteSummary,
  } as EnvironmentSnapshot)

  const finalSnapshot = execution.ok
    ? finalizeSnapshot(
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
          },
          health: {
            status: 'unknown',
            startupFailureCount: 0,
            lastCheckedAt: now,
          },
          failure: undefined,
          checks: [],
          commandAudits: appendCommandAudits(snapshot.commandAudits, execution.audits),
          deleteSummary,
          report: {
            ...snapshot.report,
            environmentReportAvailable: true,
            supportBundleAvailable: true,
            deleteResult: deleteReport,
          },
          capabilities: deriveCapabilities('not-installed', false),
          recovery: {
            recommendedAction: undefined,
            availableActions: ['export_support_bundle'],
            estimatedDuration: {},
            dataImpactSummary: {},
            hostImpactSummary: {},
            supportBundleAvailable: true,
            actionDisabledReason: {
              retry: '当前没有可重试的失败。',
              rebuild: '当前尚未创建隔离环境。',
              delete: '当前尚未创建隔离环境。',
            },
          },
          activeOperation: undefined,
          actionLocks: [],
        },
        config,
      )
    : buildFailureSnapshot(
        snapshot,
        config,
        now,
        execution.failure,
        snapshot.installation.state,
        execution.audits,
      )

  return createPlannedOperation({
    action: 'delete_environment',
    snapshot,
    runningSnapshot,
    finalSnapshot,
    operationId,
    success: execution.ok,
    failure: execution.ok ? undefined : execution.failure,
    runningStage: 'deleting',
    finalStage: execution.ok ? 'completed' : execution.stage,
    progressLabel: execution.ok ? 'Environment deleted' : 'Delete failed',
  })
}

async function executeActionPlan(
  action: TemplatedAction,
  operationId: string,
  config: BridgeConfig,
  plan: ActionCommandPlan[],
): Promise<ActionExecutionResult> {
  const audits: CommandAuditSummary[] = []
  for (const item of plan) {
    const result = await runTemplateCommand({
      action,
      command: item.command,
      targetDistro: config.targetDistro,
      operationId,
      runtimeDir: config.runtimeDir,
      diagnosticsDir: config.diagnosticsDir,
      reportDir: config.reportDir,
      distroInstallRoot: config.distroInstallRoot,
      rebootResumeMarkerPath: config.rebootResumeMarkerPath,
      installerDownloadUrl: config.installerDownloadUrl,
      installerChecksum: config.installerChecksum,
      bundledRootfsPath: config.bundledRootfsPath,
      bundledAgentArtifactPath: config.bundledAgentArtifactPath,
      additionalSensitiveValues: [config.token, ...config.hostWriteAllowlist],
    })
    audits.push(result.audit)

    if (!result.ok) {
      return {
        ok: false,
        stage: item.stage,
        audits,
        failure: {
          stage: result.failureStage,
          type: result.failureType,
          code: result.failureCode,
          message: result.message,
          detail: result.detail,
          retryable: result.retryable,
          occurredAt: new Date().toISOString(),
          operationId,
          suggestedRecovery: suggestRecovery(item.stage),
        },
      }
    }
  }

  return {
    ok: true,
    stage: 'completed',
    audits,
  }
}

function buildInstallerSuccessSnapshot(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
  now: string,
  audits: CommandAuditSummary[],
  generation = snapshot.generation + 1,
) {
  return finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      generation,
      updatedAt: now,
      installation: {
        state: 'ready',
        installed: true,
        installedAt: snapshot.installation.installedAt ?? now,
        lastInstallAttemptAt: now,
      },
      runtime: {
        ...snapshot.runtime,
        location: 'wsl2',
        distroName: config.targetDistro,
        processState: 'stopped',
        installationLocationSummary: `agent 已安装到专用隔离环境 ${config.targetDistro}。`,
        windowsHostWritesSummary: `Windows 主环境仅写入受控目录：${config.dataRoot}、${config.runtimeDir}、${config.diagnosticsDir}、${config.reportDir}。`,
        isolationBoundarySummary: 'agent 在专用 WSL2 隔离环境中运行，高风险动作统一通过 bridge 执行。',
        hostImpactConfirmed: true,
        bridgeControlledActionsOnly: true,
        targetDistroKind: 'dedicated',
      },
      failure: undefined,
      health: {
        status: 'healthy',
        startupFailureCount: 0,
        lastCheckedAt: now,
      },
      commandAudits: appendCommandAudits(snapshot.commandAudits, audits),
      deleteSummary: {
        deletedItems: [],
        remainingItems: [config.dataRoot, config.runtimeDir, config.diagnosticsDir, config.reportDir],
        windowsHostResidualSummary: `正式版当前会在 Windows 主环境保留受控目录：${config.dataRoot}。`,
      },
      capabilities: deriveCapabilities('ready', false),
      recovery: {
        recommendedAction: undefined,
        availableActions: ['rebuild', 'delete', 'export_support_bundle'],
        estimatedDuration: {
          rebuild: '5-10 分钟',
          delete: '1-2 分钟',
        },
        dataImpactSummary: {
          rebuild: '会重建当前隔离环境，环境内临时数据可能丢失。',
          delete: '会移除当前隔离环境与运行态产物。',
        },
        hostImpactSummary: {
          rebuild: '不会把 agent 切换到 Windows 主环境运行。',
          delete: '不会删除 Windows 主环境的普通用户文件。',
        },
        supportBundleAvailable: true,
        actionDisabledReason: {
          retry: '当前没有可重试的失败。',
        },
      },
      report: {
        ...snapshot.report,
        environmentReportAvailable: true,
        supportBundleAvailable: true,
      },
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )
}

function buildFailureSnapshot(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
  now: string,
  failure: FailureSnapshot,
  installationState: EnvironmentSnapshot['installation']['state'],
  audits: CommandAuditSummary[],
) {
  return finalizeSnapshot(
    {
      ...snapshot,
      revision: snapshot.revision + 2,
      updatedAt: now,
      installation: {
        ...snapshot.installation,
        state: installationState,
        lastInstallAttemptAt: now,
      },
      failure,
      commandAudits: appendCommandAudits(snapshot.commandAudits, audits),
      capabilities: deriveCapabilities(installationState, true),
      recovery: deriveRecoveryModel({
        snapshot,
        installationState,
        failure,
      }),
      activeOperation: undefined,
      actionLocks: [],
    },
    config,
  )
}

function appendCommandAudits(
  existing: EnvironmentSnapshot['commandAudits'],
  next: CommandAuditSummary[],
) {
  const history = [...(existing ?? []), ...next]
  return history.slice(-25)
}

function createInstallerPlan(isRetry: boolean): ActionCommandPlan[] {
  const commands: ActionCommandPlan[] = [
    { command: 'check_windows_capabilities', stage: 'collecting_facts' },
    { command: 'check_wsl2', stage: 'collecting_facts' },
    { command: 'enable_wsl_optional_features', stage: 'enabling_features' },
    { command: 'install_wsl_kernel_or_update', stage: 'enabling_features' },
    { command: 'check_reboot_pending', stage: 'awaiting_reboot' },
    {
      command: isRetry ? 'check_distro' : 'create_distro',
      stage: 'preparing_distro',
    },
    { command: 'download_installer', stage: 'installing_agent' },
    { command: 'verify_checksum', stage: 'installing_agent' },
    { command: 'install_agent', stage: 'installing_agent' },
    { command: 'write_runtime_config', stage: 'writing_config' },
    { command: 'start_agent', stage: 'starting_bridge' },
    { command: 'health_check', stage: 'verifying_install' },
    { command: 'collect_environment_report', stage: 'completed' },
  ]

  if (!isRetry) {
    commands.splice(5, 0, {
      command: 'seed_distro_base',
      stage: 'preparing_distro',
    })
  }

  return commands
}

function suggestRecovery(stage: OperationSnapshot['stage']) {
  if (stage === 'awaiting_permission') {
    return 'view_fix_instructions'
  }
  if (stage === 'deleting') {
    return 'delete'
  }
  if (stage === 'cleanup_environment') {
    return 'rebuild'
  }
  if (stage === 'collecting_facts' || stage === 'enabling_features' || stage === 'awaiting_reboot') {
    return 'view_fix_instructions'
  }
  return 'retry'
}

function createRunningSnapshot(
  snapshot: EnvironmentSnapshot,
  action: EnvironmentActionType | 'installer',
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
      capabilities: {
        ...snapshot.capabilities,
        canInstall: false,
        canRetry: false,
        canStart: false,
        canStop: false,
        canRestart: false,
        canRebuild: false,
        canDelete: false,
      },
      recovery: snapshot.recovery
        ? {
            ...snapshot.recovery,
            actionDisabledReason: {
              ...snapshot.recovery.actionDisabledReason,
              retry: '当前有操作进行中。',
              rebuild: '当前有操作进行中。',
              delete: '当前有操作进行中。',
            },
          }
        : snapshot.recovery,
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
  action: EnvironmentActionType | 'installer'
  snapshot: EnvironmentSnapshot
  runningSnapshot: EnvironmentSnapshot
  finalSnapshot: EnvironmentSnapshot
  operationId: string
  success: boolean
  failure?: FailureSnapshot
  runningStage: OperationSnapshot['stage']
  finalStage: OperationSnapshot['stage']
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
      stage: input.runningStage,
      startedAt: input.runningSnapshot.updatedAt,
      updatedAt: input.runningSnapshot.updatedAt,
      generationAtStart: input.snapshot.generation,
      progress: {
        label: 'Operation in progress',
        percent: 35,
      },
    },
    finalRecord: {
      operationId: input.operationId,
      environmentId: input.snapshot.environmentId,
      action: input.action,
      status: input.success ? 'succeeded' : 'failed',
      stage: input.finalStage,
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

function deriveCapabilities(
  state: EnvironmentSnapshot['installation']['state'],
  hasFailure: boolean,
): EnvironmentSnapshot['capabilities'] {
  return {
    canRunPrecheck: true,
    canInstall: state === 'not-installed' || state === 'ready-to-install' || state === 'precheck-required',
    canRetry: state === 'install-failed' && hasFailure,
    canStart: state === 'ready' || state === 'stopped' || state === 'degraded',
    canStop: state === 'running',
    canRestart: ['ready', 'running', 'stopped', 'degraded'].includes(state),
    canRebuild: ['ready', 'running', 'stopped', 'degraded', 'install-failed'].includes(state),
    canDelete: ['ready', 'running', 'stopped', 'degraded', 'install-failed'].includes(state),
    canRequestPermission: true,
  }
}

function deriveRecoveryModel(input: {
  snapshot: EnvironmentSnapshot
  installationState: EnvironmentSnapshot['installation']['state']
  failure?: FailureSnapshot
}): EnvironmentSnapshot['recovery'] {
  const { installationState, failure } = input
  const base: EnvironmentSnapshot['recovery'] = {
    recommendedAction: undefined,
    availableActions: ['export_support_bundle'],
    estimatedDuration: {},
    dataImpactSummary: {},
    hostImpactSummary: {},
    supportBundleAvailable: true,
    actionDisabledReason: {},
  }

  if (!failure) {
    if (['ready', 'running', 'stopped', 'degraded'].includes(installationState)) {
      base.availableActions = ['rebuild', 'delete', 'export_support_bundle']
      base.estimatedDuration = {
        rebuild: '5-10 分钟',
        delete: '1-2 分钟',
      }
      base.dataImpactSummary = {
        rebuild: '会重建隔离环境，环境内临时数据可能丢失。',
        delete: '会删除隔离环境与运行态产物。',
      }
      base.hostImpactSummary = {
        rebuild: '不会把 agent 切到 Windows 主环境运行。',
        delete: '不会删除 Windows 主环境普通用户文件。',
      }
    }
    return base
  }

  if (failure.stage === 'bridge_connection') {
    return {
      ...base,
      recommendedAction: 'contact_support',
      availableActions: ['export_support_bundle'],
    }
  }

  if (failure.stage === 'permission' || failure.stage === 'wsl_enablement' || failure.stage === 'wsl_detection') {
    return {
      ...base,
      recommendedAction: 'go_fix',
      availableActions: ['export_support_bundle'],
    }
  }

  if (failure.stage === 'delete') {
    return {
      ...base,
      recommendedAction: failure.retryable ? 'retry' : 'contact_support',
      availableActions: ['retry', 'export_support_bundle'],
      estimatedDuration: { retry: '1-2 分钟' },
      dataImpactSummary: { retry: '不会再额外删除当前已保留的数据。 ' },
      hostImpactSummary: { retry: '不会触及 Windows 主环境普通用户文件。' },
    }
  }

  if (failure.stage === 'agent_start' || failure.stage === 'health_check') {
    return {
      ...base,
      recommendedAction: 'rebuild',
      availableActions: ['rebuild', 'delete', 'export_support_bundle'],
      estimatedDuration: {
        rebuild: '5-10 分钟',
        delete: '1-2 分钟',
      },
      dataImpactSummary: {
        rebuild: '会重建当前隔离环境。',
        delete: '会删除当前隔离环境。',
      },
      hostImpactSummary: {
        rebuild: '不会触及 Windows 主环境普通用户文件。',
        delete: '不会删除 Windows 主环境普通用户文件。',
      },
    }
  }

  if (failure.retryable) {
    return {
      ...base,
      recommendedAction: 'retry',
      availableActions: ['retry', 'rebuild', 'delete', 'export_support_bundle'],
      estimatedDuration: {
        retry: '1-3 分钟',
        rebuild: '5-10 分钟',
        delete: '1-2 分钟',
      },
      dataImpactSummary: {
        retry: '不改动现有隔离环境结构。',
        rebuild: '会重建当前隔离环境。',
        delete: '会删除当前隔离环境。',
      },
      hostImpactSummary: {
        retry: '不会触及 Windows 主环境。',
        rebuild: '不会把 agent 切到 Windows 主环境运行。',
        delete: '不会删除 Windows 主环境普通用户文件。',
      },
    }
  }

  return {
    ...base,
    recommendedAction: 'contact_support',
    availableActions: ['rebuild', 'delete', 'export_support_bundle'],
    estimatedDuration: {
      rebuild: '5-10 分钟',
      delete: '1-2 分钟',
    },
    dataImpactSummary: {
      rebuild: '会重建当前隔离环境。',
      delete: '会删除当前隔离环境。',
    },
    hostImpactSummary: {
      rebuild: '不会触及 Windows 主环境普通用户文件。',
      delete: '不会删除 Windows 主环境普通用户文件。',
    },
  }
}
