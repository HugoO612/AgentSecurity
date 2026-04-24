import type {
  EnvironmentActionType,
  EnvironmentId,
  OperationSnapshot,
} from '../contracts/environment'
import type { EnvironmentClient } from './environment-client'

const TERMINAL_STATUSES: OperationSnapshot['status'][] = [
  'succeeded',
  'failed',
  'cancelled',
]

const ACTION_TIMEOUTS_MS: Record<EnvironmentActionType, number> = {
  run_precheck: 60_000,
  install_environment: 600_000,
  retry_install: 600_000,
  request_permission: 60_000,
  start_agent: 60_000,
  stop_agent: 60_000,
  restart_agent: 60_000,
  rebuild_environment: 600_000,
  delete_environment: 600_000,
}

export async function pollOperationToTerminal(
  client: EnvironmentClient,
  environmentId: EnvironmentId,
  operationId: string,
  action: EnvironmentActionType,
): Promise<OperationSnapshot> {
  const start = Date.now()
  let operation = await client.getOperation(environmentId, operationId)

  while (!TERMINAL_STATUSES.includes(operation.status)) {
    if (Date.now() - start >= ACTION_TIMEOUTS_MS[action]) {
      return {
        ...operation,
        status: 'failed',
        stage: operation.stage,
        error: {
          stage: 'bridge_connection',
          type: 'timeout',
          code: 'operation_timeout',
          message: 'The operation did not finish before the timeout.',
          retryable: true,
          occurredAt: new Date().toISOString(),
        },
      }
    }

    await delay(resolvePollInterval(Date.now() - start))
    operation = await client.getOperation(environmentId, operationId)
  }

  return operation
}

function resolvePollInterval(elapsedMs: number) {
  if (elapsedMs < 10_000) {
    return 500
  }

  if (elapsedMs < 60_000) {
    return 1_000
  }

  return 2_000
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
