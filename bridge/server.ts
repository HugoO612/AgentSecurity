import { createServer, type ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ActionRequest, BridgeErrorResponse } from '../src/contracts/environment.ts'
import { planActionExecution } from './actions.ts'
import { BRIDGE_VERSION, createBridgeConfig } from './config.ts'
import { ensureDirectory } from './persistence.ts'
import { OperationStore } from './operation-store.ts'
import { applyCors, readJsonBody, validateBridgeRequest } from './security.ts'
import { createInitialSnapshot, withDiagnostics } from './sample-payloads.ts'
import { StateStore, SchemaVersionMismatchError } from './state-store.ts'

const config = createBridgeConfig()
const stateStore = new StateStore(config)
const operationStore = new OperationStore(config)

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

    if (request.method === 'POST' && url.pathname === '/actions') {
      const actionRequest = await readJsonBody<ActionRequest>(request)
      const snapshot = await stateStore.loadSnapshot()
      const plannedAction = await planActionExecution(actionRequest, snapshot, config)

      if ('error' in plannedAction) {
        respondJson(response, plannedAction.receiptStatus, {
          ...plannedAction.error,
          diagnostics: snapshot.diagnostics,
        })
        return
      }

      await stateStore.saveSnapshot(plannedAction.runningSnapshot)
      await operationStore.savePendingOperation({
        schemaVersion: 2,
        runningRecord: plannedAction.runningRecord,
        finalRecord: plannedAction.finalRecord,
        finalSnapshot: plannedAction.finalSnapshot,
        expectedGenerationToWrite: plannedAction.receipt.generationAtAccept,
        pollsRemaining: plannedAction.pollsRemaining,
      })

      respondJson(response, plannedAction.receiptStatus, plannedAction.receipt)
      return
    }

    const operationMatch = url.pathname.match(
      /^\/environments\/local-default\/operations\/([^/]+)$/,
    )
    if (request.method === 'GET' && operationMatch) {
      const operation = await operationStore.advanceOperation(operationMatch[1]!, stateStore)

      if (!operation) {
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

async function start() {
  await ensureDirectory(dirname(config.stateFile))
  await ensureDirectory(config.operationsDir)
  await ensureDirectory(config.runtimeDir)
  await ensureDirectory(config.diagnosticsDir)
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
