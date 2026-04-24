import type {
  ActionRequest,
  DiagnosticsSummary,
  EnvironmentActionType,
  EnvironmentSnapshot,
} from '../contracts/environment'
import type {
  ActionResult,
  AppRoute,
  EnvironmentAction,
  FailureInfo,
} from '../domain/types'
import { deriveCheckSummary, resolveRouteForSnapshot } from '../domain/selectors'

export function adaptContractSnapshot(
  snapshot: EnvironmentSnapshot,
): EnvironmentSnapshot {
  return snapshot
}

export function mapEnvironmentActionToRequest(
  action: Extract<EnvironmentAction, EnvironmentActionType>,
  snapshot: EnvironmentSnapshot,
): ActionRequest {
  return {
    environmentId: snapshot.environmentId,
    action,
    requestId: createRequestId(action),
    expectedGeneration: snapshot.generation,
  }
}

export function createInstallRequest(
  snapshot: EnvironmentSnapshot,
): ActionRequest {
  return {
    environmentId: snapshot.environmentId,
    action: 'install_environment',
    requestId: createRequestId('install_environment'),
    expectedGeneration: snapshot.generation,
  }
}

export function createPrecheckRequest(
  snapshot: EnvironmentSnapshot,
): ActionRequest {
  return {
    environmentId: snapshot.environmentId,
    action: 'run_precheck',
    requestId: createRequestId('run_precheck'),
    expectedGeneration: snapshot.generation,
  }
}

export function createPermissionRequest(
  snapshot: EnvironmentSnapshot,
): ActionRequest {
  return {
    environmentId: snapshot.environmentId,
    action: 'request_permission',
    requestId: createRequestId('request_permission'),
    expectedGeneration: snapshot.generation,
  }
}

export function createActionResultFromSnapshot(
  snapshot: EnvironmentSnapshot,
  success: boolean,
): ActionResult {
  const route = resolveActionRouteFromSnapshot(snapshot)

  if (success) {
    return {
      ok: true,
      snapshot,
      navigateTo: route,
    }
  }

  return {
    ok: false,
    snapshot,
    error:
      snapshot.failure ??
      ({
        type: 'unknown',
        stage: 'unknown',
        code: 'unknown',
        message: 'The operation did not complete successfully.',
        retryable: false,
        occurredAt: new Date().toISOString(),
      } satisfies FailureInfo),
    navigateTo: route,
  }
}

export function createDiagnosticsText(summary: DiagnosticsSummary): string {
  const lastOperation = summary.supportSummary.lastOperation
  const lastFailure = summary.supportSummary.lastFailure
  const lastHealthCheck = summary.supportSummary.lastHealthCheck
  const lines = [
    'Agent Security Diagnostics',
    `Conclusion: ${summary.userSummary.conclusion}`,
    `Recommended next step: ${summary.userSummary.recommendedNextStep}`,
    `Retryable: ${summary.userSummary.retryable ? 'yes' : 'no'}`,
    `Bridge version: ${summary.supportSummary.bridgeVersion}`,
    `Port: ${summary.supportSummary.port}`,
    `Generation: ${summary.supportSummary.generation}`,
    `Runtime location: ${summary.supportSummary.runtimeLocation}`,
    `Last operation: ${lastOperation?.action ?? 'none'}`,
    `Last operation status: ${lastOperation?.status ?? 'unknown'}`,
    `Last operation id: ${lastOperation?.operationId ?? 'unknown'}`,
    `Last failure stage: ${lastFailure?.stage ?? 'none'}`,
    `Last failure type: ${lastFailure?.type ?? 'unknown'}`,
    `Last failure code: ${lastFailure?.code ?? 'unknown'}`,
    `Health: ${lastHealthCheck?.status ?? 'unknown'}`,
    `Health checked at: ${lastHealthCheck?.checkedAt ?? 'unknown'}`,
  ]

  if (lastHealthCheck?.reasons?.length) {
    lines.push(`Health reasons: ${lastHealthCheck.reasons.join('; ')}`)
  }

  return lines.join('\n')
}

export function resolveActionRouteFromSnapshot(
  snapshot: EnvironmentSnapshot,
): AppRoute {
  return resolveRouteForSnapshot(snapshot, deriveCheckSummary(snapshot.checks))
}

function createRequestId(action: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${action}-${crypto.randomUUID()}`
  }

  return `${action}-${Date.now()}`
}
