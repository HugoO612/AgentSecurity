export type EnvironmentId = 'local-default'

export type BridgeMode = 'dev' | 'preview' | 'production'

export type InstallationState =
  | 'not-installed'
  | 'precheck-required'
  | 'ready-to-install'
  | 'installing'
  | 'install-failed'
  | 'ready'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'degraded'
  | 'rebuilding'
  | 'deleting'

export type RuntimeLocation = 'wsl2' | 'cloud' | 'unknown'

export type ProcessState = 'unknown' | 'starting' | 'running' | 'stopped' | 'failed'

export type PrecheckStatus = 'checking' | 'passed' | 'warning' | 'blocked' | 'unknown'

export type PrecheckCode =
  | 'windows_version'
  | 'wsl_status'
  | 'virtualization'
  | 'disk_space'
  | 'network'
  | 'permission'
  | 'distro'
  | 'agent_installed'
  | 'host_isolation'
  | 'recovery_available'
  | 'delete_available'
  | 'unknown'

export type FailureStage =
  | 'bootstrap'
  | 'bridge_connection'
  | 'precheck'
  | 'permission'
  | 'wsl_detection'
  | 'wsl_enablement'
  | 'distro_creation'
  | 'environment_install'
  | 'agent_install'
  | 'agent_start'
  | 'agent_stop'
  | 'health_check'
  | 'rebuild'
  | 'delete'
  | 'unknown'

export type FailureType =
  | 'missing_capability'
  | 'permission_required'
  | 'transient'
  | 'environment_inconsistent'
  | 'startup_failed'
  | 'degraded_state'
  | 'generation_conflict'
  | 'unsupported_environment'
  | 'permission_denied'
  | 'disk_space_insufficient'
  | 'network_error'
  | 'timeout'
  | 'command_failed'
  | 'state_conflict'
  | 'operation_in_progress'
  | 'unknown'

export type SuggestedRecovery =
  | 'retry'
  | 'rebuild'
  | 'delete'
  | 'refresh_snapshot'
  | 'view_fix_instructions'
  | 'contact_support'

export type EnvironmentActionType =
  | 'run_precheck'
  | 'install_environment'
  | 'retry_install'
  | 'request_permission'
  | 'start_agent'
  | 'stop_agent'
  | 'restart_agent'
  | 'rebuild_environment'
  | 'delete_environment'

export type OperationStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type OperationStage =
  | 'queued'
  | 'validating'
  | 'precheck'
  | 'installing'
  | 'starting'
  | 'stopping'
  | 'rebuilding'
  | 'deleting'
  | 'finalizing'
  | 'collecting_facts'
  | 'enabling_features'
  | 'awaiting_permission'
  | 'awaiting_reboot'
  | 'preparing_distro'
  | 'installing_agent'
  | 'writing_config'
  | 'starting_bridge'
  | 'verifying_install'
  | 'completed'
  | 'check_wsl2'
  | 'check_distro'
  | 'download_installer'
  | 'verify_checksum'
  | 'install_agent'
  | 'write_runtime_config'
  | 'health_check'
  | 'cleanup_environment'

export type BridgeConnectionFailureKind =
  | 'bootstrap_invalid'
  | 'bridge_unavailable'
  | 'bridge_untrusted'
  | 'bridge_forbidden'

export type BootstrapErrorCode =
  | 'bootstrap_missing'
  | 'bootstrap_version_unsupported'
  | 'bootstrap_field_missing'
  | 'bootstrap_field_invalid'
  | 'bootstrap_mock_forbidden_in_production'
  | 'bootstrap_bridge_url_forbidden'

export type BootstrapConfig = {
  version: 'v1'
  mode: BridgeMode
  sessionToken: string
  bridgeBaseUrl: string
  appOrigin: string
  allowMockFallback: boolean
}

export type CommandAuditSummary = {
  commandId: string
  action: EnvironmentActionType | 'installer'
  stage: FailureStage | OperationStage
  startedAt: string
  completedAt: string
  durationMs: number
  executor?: 'live' | 'dev-shim'
  exitCode?: number
  timedOut: boolean
  stdoutPreview?: string
  stderrPreview?: string
  failureCode?: string
}

export interface PrecheckItem {
  code: PrecheckCode
  status: PrecheckStatus
  message: string
  detail?: string
  rawDetail?: string
  resolutionKind?: 'auto' | 'user_confirm' | 'manual' | 'support'
  userAction?: 'none' | 'retry' | 'manual_fix' | 'request_permission'
  updatedAt: string
}

export interface FailureSnapshot {
  stage: FailureStage
  type: FailureType
  code: string
  message: string
  detail?: string
  retryable: boolean
  occurredAt: string
  operationId?: string
  suggestedRecovery?: SuggestedRecovery
}

export interface OperationSummary {
  operationId: string
  action: EnvironmentActionType | 'installer'
  status: 'queued' | 'running'
  stage: FailureStage | OperationStage
  startedAt: string
  updatedAt: string
  requestedGeneration: number
}

export interface ActionLock {
  action: EnvironmentActionType
  reason:
    | 'operation_in_progress'
    | 'generation_mismatch'
    | 'state_conflict'
    | 'permission_required'
  message: string
}

export interface EnvironmentReport {
  generatedAt: string
  runtimeLocation: string
  targetDistro: string
  bridgeStatus: string
  windowsHostWritesSummary: string
  windowsHostNoWriteSummary: string
  installationLocationSummary: string
  isolationBoundarySummary: string
  currentPermissionSummary: string
  currentLogLocationSummary: string
  currentRuntimeDirectorySummary: string
}

export interface BoundarySelfCheckReport {
  generatedAt: string
  agentRunsInsideWindowsHost: boolean
  bridgeControlsHighRiskActions: boolean
  currentPermissionState: string
  bridgeControlStatus: string
  hostImpactConfirmed: boolean
  summary: string
}

export interface DeleteResultReport {
  generatedAt: string
  deletedItems: string[]
  remainingItems: string[]
  windowsHostResidualSummary: string
  summary: string
}

export interface SupportBundleExport {
  exportedAt: string
  environmentReport: EnvironmentReport
  boundarySelfCheck: BoundarySelfCheckReport
  deleteResult?: DeleteResultReport
  diagnostics: DiagnosticsSummary
}

export interface DiagnosticsSummary {
  userSummary: {
    conclusion: string
    recommendedNextStep: string
    retryable: boolean
  }
  supportSummary: {
    bridgeVersion: string
    port: number
    generation: number
    runtimeLocation: RuntimeLocation
    executionMode?: 'live' | 'dev-shim'
    artifactStatus?: {
      source: 'bundled' | 'unknown'
      checksumConfigured: boolean
      checksumValidation: 'not-run' | 'passed' | 'failed'
      targetDistro: string
      agentVersion?: string
    }
    mode?: BridgeMode
    isMock?: boolean
    lastOperation?: {
      action: EnvironmentActionType | 'installer'
      status: OperationStatus
      operationId: string
      updatedAt: string
    }
    lastFailure?: {
      stage: FailureStage
      type: FailureType
      code: string
      occurredAt: string
    }
    lastHealthCheck?: {
      status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
      checkedAt: string
      reasons?: string[]
    }
    recentCommands?: CommandAuditSummary[]
  }
}

export interface EnvironmentSnapshot {
  environmentId: EnvironmentId
  revision: number
  generation: number
  updatedAt: string
  installation: {
    state: InstallationState
    installed: boolean
    installedAt?: string
    lastInstallAttemptAt?: string
  }
  runtime: {
    location: RuntimeLocation
    distroName?: string
    agentName?: string
    agentVersion?: string
    processState?: ProcessState
    lastStartedAt?: string
    lastStoppedAt?: string
    installationLocationSummary?: string
    windowsHostWritesSummary?: string
    isolationBoundarySummary?: string
    hostImpactConfirmed?: boolean
    bridgeControlledActionsOnly?: boolean
    targetDistroKind?: 'dedicated'
  }
  checks: PrecheckItem[]
  health: {
    status: 'unknown' | 'healthy' | 'degraded' | 'unhealthy'
    lastCheckedAt?: string
    startupFailureCount: number
    reasons?: string[]
  }
  activeOperation?: OperationSummary
  failure?: FailureSnapshot
  capabilities: {
    canRunPrecheck: boolean
    canInstall: boolean
    canRetry: boolean
    canStart: boolean
    canStop: boolean
    canRestart: boolean
    canRebuild: boolean
    canDelete: boolean
    canRequestPermission: boolean
  }
  diagnostics: DiagnosticsSummary
  actionLocks?: ActionLock[]
  commandAudits?: CommandAuditSummary[]
  report?: {
    environmentReportAvailable: boolean
    supportBundleAvailable: boolean
    environment?: EnvironmentReport
    boundary?: BoundarySelfCheckReport
    deleteResult?: DeleteResultReport
  }
  deleteSummary?: {
    deletedItems: string[]
    remainingItems: string[]
    windowsHostResidualSummary: string
  }
  security?: {
    boundarySelfCheck: string
    bridgeControlStatus: string
  }
  recovery?: {
    recommendedAction?: 'retry' | 'rebuild' | 'delete' | 'go_fix' | 'contact_support'
    availableActions: Array<'retry' | 'rebuild' | 'delete' | 'export_support_bundle'>
    estimatedDuration: Partial<Record<'retry' | 'rebuild' | 'delete', string>>
    dataImpactSummary: Partial<Record<'retry' | 'rebuild' | 'delete', string>>
    hostImpactSummary: Partial<Record<'retry' | 'rebuild' | 'delete', string>>
    supportBundleAvailable: boolean
    actionDisabledReason?: Partial<Record<'retry' | 'rebuild' | 'delete', string>>
  }
}

export interface ActionRequest {
  environmentId: EnvironmentId
  action: EnvironmentActionType
  requestId: string
  expectedGeneration?: number
  confirmToken?: string
  payload?: Record<string, unknown>
}

export interface ConfirmTokenRequest {
  environmentId: EnvironmentId
  action: 'rebuild_environment' | 'delete_environment'
}

export interface ConfirmTokenReceipt {
  token: string
  action: 'rebuild_environment' | 'delete_environment'
  expiresAt: string
}

export interface ActionReceipt {
  accepted: true
  operationId: string
  environmentId: EnvironmentId
  action: EnvironmentActionType | 'installer'
  acceptedAt: string
  generationAtAccept: number
}

export interface OperationSnapshot {
  operationId: string
  environmentId: EnvironmentId
  action: EnvironmentActionType | 'installer'
  status: OperationStatus
  stage: FailureStage | OperationStage
  progress?: {
    percent?: number
    label: string
  }
  startedAt?: string
  updatedAt: string
  completedAt?: string
  generationAtStart: number
  generationAtCompletion?: number
  result?: {
    snapshotRevision?: number
    generation?: number
  }
  error?: FailureSnapshot
}

export interface BridgeErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    retryable: boolean
    stage?: FailureStage
    type?: FailureType
    kind?: BridgeConnectionFailureKind
  }
  diagnostics?: DiagnosticsSummary
}
