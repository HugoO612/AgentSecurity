import { createServer, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ActionRequest,
  BridgeErrorResponse,
  ConfirmTokenRequest,
} from '../src/contracts/environment.ts'
import {
  planActionExecution,
  planInstallerExecution,
} from './actions.ts'
import { BRIDGE_VERSION, createBridgeConfig } from './config.ts'
import { ensureDirectory, readJsonFile, removePath } from './persistence.ts'
import { OperationStore } from './operation-store.ts'
import { buildSupportBundleExport } from './report-builder.ts'
import { applyCors, readJsonBody, validateBridgeRequest } from './security.ts'
import { createInitialSnapshot, withDiagnostics } from './sample-payloads.ts'
import { StateStore, SchemaVersionMismatchError } from './state-store.ts'

const config = createBridgeConfig()
const stateStore = new StateStore(config)
const operationStore = new OperationStore(config)
const destructiveConfirmTokens = new Map<
  string,
  { action: 'rebuild_environment' | 'delete_environment'; expiresAt: number }
>()

const server = createServer(async (request, response) => {
  applyCors(request, response, config)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  try {
    const rejection = validateBridgeRequest(request, config)
    if (rejection) {
      respondJson(response, rejection.status, rejection.body)
      return
    }

    const url = new URL(request.url ?? '/', config.bridgeOrigin)

    if (request.method === 'GET' && url.pathname === '/health') {
      respondJson(response, 200, {
        ok: true,
        version: BRIDGE_VERSION,
        environmentId: 'local-default',
      })
      return
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/environments/local-default/snapshot'
    ) {
      const snapshot = await stateStore.loadSnapshot()
      respondJson(response, 200, snapshot)
      return
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/environments/local-default/diagnostics/summary'
    ) {
      const snapshot = await stateStore.loadSnapshot()
      respondJson(response, 200, snapshot.diagnostics)
      return
    }

    if (request.method === 'GET' && url.pathname === '/reports/environment') {
      const snapshot = await stateStore.loadSnapshot()
      respondJson(response, 200, snapshot.report?.environment)
      return
    }

    if (request.method === 'GET' && url.pathname === '/reports/boundary') {
      const snapshot = await stateStore.loadSnapshot()
      respondJson(response, 200, snapshot.report?.boundary)
      return
    }

    if (request.method === 'GET' && url.pathname === '/reports/delete-last') {
      const snapshot = await stateStore.loadSnapshot()
      respondJson(response, 200, snapshot.report?.deleteResult ?? null)
      return
    }

    if (request.method === 'GET' && url.pathname === '/diagnostics/export') {
      const snapshot = await stateStore.loadSnapshot()
      respondJson(
        response,
        200,
        buildSupportBundleExport(snapshot, {
          mode: config.mode,
          bridgeOrigin: config.bridgeOrigin,
          runtimeDir: config.runtimeDir,
          diagnosticsDir: config.diagnosticsDir,
          dataDir: config.dataRoot,
          targetDistro: config.targetDistro,
        }),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/actions') {
      const actionRequest = await readJsonBody<ActionRequest>(request)
      const snapshot = await stateStore.loadSnapshot()
      if (
        actionRequest.action === 'rebuild_environment' ||
        actionRequest.action === 'delete_environment'
      ) {
        if (!consumeConfirmToken(actionRequest.action, actionRequest.confirmToken)) {
          respondJson(response, 409, {
            ok: false,
            error: {
              code: 'confirm_token_invalid',
              message: 'The destructive action confirm token is missing or invalid.',
              retryable: true,
              stage: 'unknown',
              type: 'state_conflict',
            },
            diagnostics: snapshot.diagnostics,
          } satisfies BridgeErrorResponse)
          return
        }
      }
      const plannedAction = await planActionExecution(actionRequest, snapshot, config)

      if ('error' in plannedAction) {
        respondJson(response, plannedAction.receiptStatus, {
          ...plannedAction.error,
          diagnostics: snapshot.diagnostics,
        })
        return
      }

      await persistPlannedOperation(plannedAction)
      respondJson(response, plannedAction.receiptStatus, plannedAction.receipt)
      return
    }

    if (request.method === 'POST' && url.pathname === '/actions/confirm-token') {
      const body = await readJsonBody<ConfirmTokenRequest>(request)
      if (!['rebuild_environment', 'delete_environment'].includes(body.action)) {
        respondJson(response, 400, {
          ok: false,
          error: {
            code: 'confirm_action_invalid',
            message: 'Only destructive actions can request a confirm token.',
            retryable: false,
            stage: 'unknown',
            type: 'state_conflict',
          },
        } satisfies BridgeErrorResponse)
        return
      }
      const token = randomUUID()
      const expiresAt = Date.now() + 5 * 60_000
      destructiveConfirmTokens.set(token, {
        action: body.action,
        expiresAt,
      })
      respondJson(response, 200, {
        token,
        action: body.action,
        expiresAt: new Date(expiresAt).toISOString(),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/installer/start') {
      const snapshot = await stateStore.loadSnapshot()
      const plannedInstaller = await planInstallerExecution(snapshot, config)

      if ('error' in plannedInstaller) {
        respondJson(response, plannedInstaller.receiptStatus, {
          ...plannedInstaller.error,
          diagnostics: snapshot.diagnostics,
        })
        return
      }

      await persistPlannedOperation(plannedInstaller)
      respondJson(response, plannedInstaller.receiptStatus, plannedInstaller.receipt)
      return
    }

    const operationMatch = url.pathname.match(
      /^\/environments\/local-default\/operations\/([^/]+)$/,
    )
    if (request.method === 'GET' && operationMatch) {
      const operation = await operationStore.advanceOperation(operationMatch[1]!, stateStore)

      if (!operation) {
        respondOperationNotFound(response)
        return
      }

      respondJson(response, 200, operation)
      return
    }

    const installerOperationMatch = url.pathname.match(
      /^\/installer\/operations\/([^/]+)$/,
    )
    if (request.method === 'GET' && installerOperationMatch) {
      const operation = await operationStore.advanceOperation(installerOperationMatch[1]!, stateStore)

      if (!operation) {
        respondOperationNotFound(response)
        return
      }

      respondJson(response, 200, operation)
      return
    }

    respondJson(response, 404, {
      ok: false,
      error: {
        code: 'not_found',
        message: 'Not found.',
        retryable: false,
      },
    } satisfies BridgeErrorResponse)
  } catch (error) {
    const failureSnapshot = await resolveRecoverableFailure(error)
    if (failureSnapshot) {
      respondJson(response, 503, failureSnapshot)
      return
    }

    respondJson(response, 500, {
      ok: false,
      error: {
        code: 'bridge_failure',
        message: error instanceof Error ? error.message : 'bridge_failure',
        retryable: true,
        kind: 'bridge_unavailable',
        stage: 'bridge_connection',
      },
    } satisfies BridgeErrorResponse)
  }
})

async function persistPlannedOperation(
  plannedAction: Exclude<Awaited<ReturnType<typeof planInstallerExecution>>, { receiptStatus: 409 | 400; error: BridgeErrorResponse }>,
) {
  await stateStore.saveSnapshot(plannedAction.runningSnapshot)
  await operationStore.savePendingOperation({
    schemaVersion: 3,
    runningRecord: plannedAction.runningRecord,
    finalRecord: plannedAction.finalRecord,
    finalSnapshot: plannedAction.finalSnapshot,
    expectedGenerationToWrite: plannedAction.receipt.generationAtAccept,
    pollsRemaining: plannedAction.pollsRemaining,
  })
}

function respondOperationNotFound(response: ServerResponse) {
  respondJson(response, 404, {
    ok: false,
    error: {
      code: 'operation_not_found',
      message: 'Operation not found.',
      retryable: false,
      stage: 'unknown',
      type: 'state_conflict',
    },
  } satisfies BridgeErrorResponse)
}

async function start() {
  await ensureDirectory(dirname(config.stateFile))
  await ensureDirectory(config.operationsDir)
  await ensureDirectory(config.runtimeDir)
  await ensureDirectory(config.diagnosticsDir)
  await ensureDirectory(config.reportDir)
  try {
    await stateStore.loadSnapshot()
  } catch (error) {
    if (error instanceof SchemaVersionMismatchError) {
      await stateStore.saveSnapshot(
        withDiagnostics(createInitialSnapshot(config), config),
      )
    } else {
      throw error
    }
  }

  await resumeInstallerAfterRebootIfNeeded()

  return new Promise<void>((resolve) => {
    server.listen(config.port, '127.0.0.1', () => {
      process.stdout.write(
        `Agent Security bridge listening on ${config.bridgeOrigin}\n`,
      )
      resolve()
    })
  })
}

async function resolveRecoverableFailure(
  error: unknown,
): Promise<BridgeErrorResponse | null> {
  if (!(error instanceof SchemaVersionMismatchError)) {
    return null
  }

  return {
    ok: false,
    error: {
      code: 'state_schema_mismatch',
      message: error.message,
      retryable: false,
      stage: 'bridge_connection',
      type: 'state_conflict',
      kind: 'bridge_unavailable',
    },
  }
}

function respondJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void start()
}

export { start, server }

function consumeConfirmToken(
  action: 'rebuild_environment' | 'delete_environment',
  token?: string,
) {
  if (!token) {
    return false
  }
  const stored = destructiveConfirmTokens.get(token)
  if (!stored) {
    return false
  }
  if (stored.action !== action || stored.expiresAt < Date.now()) {
    destructiveConfirmTokens.delete(token)
    return false
  }
  destructiveConfirmTokens.delete(token)
  return true
}

async function resumeInstallerAfterRebootIfNeeded() {
  const resumeMarker = await readJsonFile<{
    resume?: string
    targetDistro?: string
  }>(config.rebootResumeMarkerPath)
  if (!resumeMarker || resumeMarker.resume !== 'installer') {
    return
  }

  const snapshot = await stateStore.loadSnapshot()
  if (snapshot.activeOperation) {
    await removePath(config.rebootResumeMarkerPath)
    return
  }

  const plannedInstaller = await planInstallerExecution(snapshot, config)
  if ('error' in plannedInstaller) {
    return
  }

  await persistPlannedOperation(plannedInstaller)
  await removePath(config.rebootResumeMarkerPath)
}
