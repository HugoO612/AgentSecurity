import type {
  ActionReceipt,
  ActionRequest,
  ConfirmTokenReceipt,
  BootstrapErrorCode,
  BoundarySelfCheckReport,
  DeleteResultReport,
  DiagnosticsSummary,
  EnvironmentId,
  EnvironmentReport,
  EnvironmentSnapshot,
  OperationSnapshot,
  BridgeConnectionFailureKind,
  SupportBundleExport,
} from '../contracts/environment'

export const DEFAULT_ENVIRONMENT_ID: EnvironmentId = 'local-default'

export type EnvironmentClientDiagnostics = {
  mode: 'bridge' | 'mock-fallback' | 'bridge-error'
  bridgeAvailable: boolean
  errorMessage: string | null
  bootstrap: {
    status: 'valid' | 'invalid'
    code?: BootstrapErrorCode
    message?: string
  }
  connectionFailure: null | {
    kind: BridgeConnectionFailureKind
    code: string
    message: string
    retryable: boolean
  }
  diagnosticsSummary: DiagnosticsSummary | null
}

export interface EnvironmentClient {
  getSnapshot(environmentId: EnvironmentId): Promise<EnvironmentSnapshot>
  postAction(request: ActionRequest): Promise<ActionReceipt>
  requestConfirmToken(
    environmentId: EnvironmentId,
    action: 'rebuild_environment' | 'delete_environment',
  ): Promise<ConfirmTokenReceipt>
  startInstaller(environmentId: EnvironmentId): Promise<ActionReceipt>
  getOperation(
    environmentId: EnvironmentId,
    operationId: string,
  ): Promise<OperationSnapshot>
  getInstallerOperation(operationId: string): Promise<OperationSnapshot>
  getDiagnosticsSummary?(environmentId: EnvironmentId): Promise<DiagnosticsSummary>
  getEnvironmentReport?(): Promise<EnvironmentReport>
  getBoundaryReport?(): Promise<BoundarySelfCheckReport>
  getDeleteReport?(): Promise<DeleteResultReport | null>
  exportSupportBundle?(): Promise<SupportBundleExport>
  getDiagnostics?(): EnvironmentClientDiagnostics
  debugApplyScenario?(scenarioId: string): Promise<void>
}
