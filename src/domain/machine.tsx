/* eslint-disable react-refresh/only-export-components */
import { useMachine } from '@xstate/react'
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { assign, fromPromise, setup } from 'xstate'
import type {
  ActionReceipt,
  EnvironmentId,
  EnvironmentActionType,
} from '../contracts/environment'
import {
  adaptContractSnapshot,
  createActionResultFromSnapshot,
  createPermissionRequest,
  createPrecheckRequest,
  mapEnvironmentActionToRequest,
} from '../api/environment-adapter'
import { BridgeRequestError } from '../api/environment-http-client'
import {
  pollInstallerOperationToTerminal,
  pollOperationToTerminal,
} from '../api/operation-poller'
import {
  DEFAULT_ENVIRONMENT_ID,
  type EnvironmentClientDiagnostics,
  type EnvironmentClient,
} from '../api/environment-client'
import { createBrowserEnvironmentClient } from '../api/environment-browser-client'
import { createInitialSnapshot, getScenarioTemplate } from './mock-data'
import {
  deriveAvailableActions,
  deriveCheckSummary,
  deriveEnvironmentState,
  deriveRecommendedAction,
  deriveStatusTone,
  resolveRouteForSnapshot,
} from './selectors'
import type {
  ActionResult,
  AppRoute,
  EnvironmentAction,
  EnvironmentDerived,
  EnvironmentSnapshot,
  FailureInfo,
} from './types'
import type { SupportBundleExport } from '../contracts/environment'

type PendingIntent =
  | { kind: 'refresh' }
  | {
      kind: 'followOperation'
      operationId: string
      action: EnvironmentActionType | 'installer'
    }
  | { kind: 'precheck' }
  | { kind: 'install' }
  | { kind: 'requestPermission' }
  | {
      kind: 'action'
      action: Exclude<EnvironmentAction, 'view_fix_instructions' | 'refresh_snapshot'>
      confirmToken?: string
    }
  | { kind: 'applyScenario'; scenarioId: string }

type MachineContext = {
  client: EnvironmentClient
  environmentId: EnvironmentId
  snapshot: EnvironmentSnapshot
  pendingIntent: PendingIntent | null
  pendingRoute: AppRoute | null
  lastResult: ActionResult | null
  lastReceipt: ActionReceipt | null
}

type MachineEvent =
  | { type: 'REFRESH' }
  | {
      type: 'FOLLOW_OPERATION'
      operationId: string
      action: EnvironmentActionType | 'installer'
    }
  | { type: 'BEGIN_PRECHECK' }
  | { type: 'START_INSTALL' }
  | { type: 'REQUEST_PERMISSION' }
  | {
      type: 'RUN_ACTION'
      action: Exclude<EnvironmentAction, 'view_fix_instructions' | 'refresh_snapshot'>
      confirmToken?: string
    }
  | { type: 'APPLY_SCENARIO'; scenarioId: string }
  | { type: 'CONSUME_NAVIGATION' }

type IntentExecutionResult = {
  snapshot: EnvironmentSnapshot
  lastResult: ActionResult | null
  lastReceipt: ActionReceipt | null
}

type EnvironmentContextValue = {
  snapshot: EnvironmentSnapshot
  derived: EnvironmentDerived
  checkSummary: ReturnType<typeof deriveCheckSummary>
  state: ReturnType<typeof deriveEnvironmentState>
  lastResult: ActionResult | null
  lastReceipt: ActionReceipt | null
  pendingRoute: AppRoute | null
  clientDiagnostics: EnvironmentClientDiagnostics
  beginPrecheck: () => void
  startInstall: () => void
  requestPermission: () => void
  runAction: (
    action: Exclude<EnvironmentAction, 'view_fix_instructions' | 'refresh_snapshot'>,
    confirmToken?: string,
  ) => void
  requestConfirmToken: (
    action: 'rebuild_environment' | 'delete_environment',
  ) => Promise<string>
  exportSupportBundle: () => Promise<SupportBundleExport>
  refreshSnapshot: () => void
  applyScenario: (scenarioId: string) => void
  consumeNavigation: () => void
}

async function fetchDomainSnapshot(
  client: EnvironmentClient,
  environmentId: EnvironmentId,
) {
  const snapshot = await client.getSnapshot(environmentId)
  return adaptContractSnapshot(snapshot)
}

async function executeActionRequest(
  client: EnvironmentClient,
  snapshot: EnvironmentSnapshot,
  action:
    | ReturnType<typeof createPrecheckRequest>
    | ReturnType<typeof createPermissionRequest>
    | ReturnType<typeof mapEnvironmentActionToRequest>,
): Promise<IntentExecutionResult> {
  try {
    const receipt = await client.postAction(action)
    const operation = await pollOperationToTerminal(
      client,
      action.environmentId,
      receipt.operationId,
      action.action,
    )
    const latestSnapshot = await fetchDomainSnapshot(client, action.environmentId)
    const success =
      operation.status === 'succeeded' &&
      (operation.generationAtCompletion === undefined ||
        operation.generationAtCompletion === latestSnapshot.generation)

    return {
      snapshot: latestSnapshot,
      lastReceipt: receipt,
      lastResult: createActionResultFromSnapshot(latestSnapshot, success),
    }
  } catch (error) {
    const latestSnapshot = await tryFetchLatestSnapshot(
      client,
      action.environmentId,
      snapshot,
    )

    return {
      snapshot: latestSnapshot,
      lastReceipt: null,
      lastResult: {
        ok: false,
        snapshot: latestSnapshot,
        error: resolveActionError(error, latestSnapshot),
        navigateTo: resolveRouteForSnapshot(
          latestSnapshot,
          deriveCheckSummary(latestSnapshot.checks),
        ),
      },
    }
  }
}

async function executeInstallerRequest(
  client: EnvironmentClient,
  snapshot: EnvironmentSnapshot,
  environmentId: EnvironmentId,
): Promise<IntentExecutionResult> {
  try {
    const receipt = await client.startInstaller(environmentId)
    const operation = await pollInstallerOperationToTerminal(
      client,
      receipt.operationId,
    )
    const latestSnapshot = await fetchDomainSnapshot(client, environmentId)
    const success =
      operation.status === 'succeeded' &&
      (operation.generationAtCompletion === undefined ||
        operation.generationAtCompletion === latestSnapshot.generation)

    return {
      snapshot: latestSnapshot,
      lastReceipt: receipt,
      lastResult: success
        ? {
            ok: true,
            snapshot: latestSnapshot,
            navigateTo: '/install-complete',
          }
        : createActionResultFromSnapshot(latestSnapshot, false),
    }
  } catch (error) {
    const latestSnapshot = await tryFetchLatestSnapshot(
      client,
      environmentId,
      snapshot,
    )

    return {
      snapshot: latestSnapshot,
      lastReceipt: null,
      lastResult: {
        ok: false,
        snapshot: latestSnapshot,
        error: resolveActionError(error, latestSnapshot),
        navigateTo: resolveRouteForSnapshot(
          latestSnapshot,
          deriveCheckSummary(latestSnapshot.checks),
        ),
      },
    }
  }
}

async function executeIntent(
  client: EnvironmentClient,
  environmentId: EnvironmentId,
  snapshot: EnvironmentSnapshot,
  intent: PendingIntent,
): Promise<IntentExecutionResult> {
  switch (intent.kind) {
    case 'refresh': {
      const nextSnapshot = await fetchDomainSnapshot(client, environmentId)
      return {
        snapshot: nextSnapshot,
        lastResult: null,
        lastReceipt: null,
      }
    }
    case 'followOperation': {
      const operation =
        intent.action === 'installer'
          ? await pollInstallerOperationToTerminal(client, intent.operationId)
          : await pollOperationToTerminal(
              client,
              environmentId,
              intent.operationId,
              intent.action,
            )
      const latestSnapshot = await fetchDomainSnapshot(client, environmentId)
      const success =
        operation.status === 'succeeded' &&
        (operation.generationAtCompletion === undefined ||
          operation.generationAtCompletion === latestSnapshot.generation)
      const navigateTo =
        success && intent.action === 'installer'
          ? '/install-complete'
          : success && intent.action === 'delete_environment'
            ? '/delete-complete'
            : undefined
      return {
        snapshot: latestSnapshot,
        lastResult: success
          ? {
              ok: true,
              snapshot: latestSnapshot,
              navigateTo,
            }
          : createActionResultFromSnapshot(latestSnapshot, false),
        lastReceipt: null,
      }
    }
    case 'applyScenario': {
      if (client.debugApplyScenario) {
        await client.debugApplyScenario(intent.scenarioId)
      }
      return {
        snapshot: await fetchDomainSnapshot(client, environmentId),
        lastResult: null,
        lastReceipt: null,
      }
    }
    case 'precheck':
      return executeActionRequest(
        client,
        snapshot,
        createPrecheckRequest(snapshot),
      )
    case 'install':
      return executeInstallerRequest(client, snapshot, environmentId)
    case 'requestPermission':
      return executeActionRequest(
        client,
        snapshot,
        createPermissionRequest(snapshot),
      )
    case 'action':
      return executeActionRequest(
        client,
        snapshot,
        mapEnvironmentActionToRequest(intent.action, snapshot, {
          confirmToken: intent.confirmToken,
        }),
      )
  }
}

const environmentMachine = setup({
  types: {
    context: {} as MachineContext,
    input: {} as {
      initialSnapshot: EnvironmentSnapshot
      client: EnvironmentClient
      environmentId: EnvironmentId
    },
    events: {} as MachineEvent,
  },
  actors: {
    executeIntent: fromPromise(
      async ({
        input,
      }: {
        input: {
          client: EnvironmentClient
          environmentId: EnvironmentId
          snapshot: EnvironmentSnapshot
          intent: PendingIntent
        }
      }) =>
        executeIntent(
          input.client,
          input.environmentId,
          input.snapshot,
          input.intent,
        ),
    ),
  },
}).createMachine({
  id: 'environment',
  initial: 'idle',
  context: ({ input }) => ({
    client: input.client,
    environmentId: input.environmentId,
    snapshot: input.initialSnapshot,
    pendingIntent: null,
    lastResult: null,
    lastReceipt: null,
    pendingRoute: null,
  }),
  states: {
    idle: {
      on: {
        REFRESH: {
          target: 'busy',
          actions: assign(() => ({
            pendingIntent: { kind: 'refresh' },
            lastResult: null,
            pendingRoute: null,
          })),
        },
        FOLLOW_OPERATION: {
          target: 'busy',
          actions: assign(({ event }) => ({
            pendingIntent: {
              kind: 'followOperation',
              operationId: event.operationId,
              action: event.action,
            },
            lastResult: null,
            pendingRoute: event.action === 'installer' ? '/installing' : null,
          })),
        },
        BEGIN_PRECHECK: {
          target: 'busy',
          actions: assign(() => ({
            pendingIntent: { kind: 'precheck' },
            lastResult: null,
            pendingRoute: '/precheck',
          })),
        },
        START_INSTALL: {
          target: 'busy',
          actions: assign(() => ({
            pendingIntent: { kind: 'install' },
            lastResult: null,
            pendingRoute: '/installing',
          })),
        },
        REQUEST_PERMISSION: {
          target: 'busy',
          actions: assign(() => ({
            pendingIntent: { kind: 'requestPermission' },
            lastResult: null,
            pendingRoute: '/installing',
          })),
        },
        RUN_ACTION: {
          guard: ({ context, event }) => {
            const checkSummary = deriveCheckSummary(context.snapshot.checks)
            const state = deriveEnvironmentState(context.snapshot, checkSummary)
            return deriveAvailableActions(state, context.snapshot).includes(
              event.action,
            )
          },
          target: 'busy',
          actions: assign(({ event }) => ({
            pendingIntent: {
              kind: 'action',
              action: event.action,
              confirmToken: event.confirmToken,
            },
            lastResult: null,
            pendingRoute:
              event.action === 'retry_install' ? '/installing' : '/status',
          })),
        },
        APPLY_SCENARIO: {
          target: 'busy',
          actions: assign(({ event }) => ({
            pendingIntent: { kind: 'applyScenario', scenarioId: event.scenarioId },
            lastResult: null,
            pendingRoute: null,
          })),
        },
        CONSUME_NAVIGATION: {
          actions: assign(() => ({
            lastResult: null,
            pendingRoute: null,
          })),
        },
      },
    },
    busy: {
      invoke: {
        src: 'executeIntent',
        input: ({ context }) => ({
          client: context.client,
          environmentId: context.environmentId,
          snapshot: context.snapshot,
          intent: context.pendingIntent!,
        }),
        onDone: {
          target: 'idle',
          actions: assign(({ event }) => ({
            snapshot: event.output.snapshot,
            pendingIntent: null,
            lastResult: event.output.lastResult,
            lastReceipt: event.output.lastReceipt,
            pendingRoute: null,
          })),
        },
        onError: {
          target: 'idle',
          actions: assign(() => ({
            pendingIntent: null,
            pendingRoute: null,
          })),
        },
      },
    },
  },
})

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null)

export function EnvironmentProvider({
  children,
  initialSnapshot,
  client,
  environmentId = DEFAULT_ENVIRONMENT_ID,
}: PropsWithChildren<{
  initialSnapshot?: EnvironmentSnapshot
  client?: EnvironmentClient
  environmentId?: EnvironmentId
}>) {
  const resolvedClient = useMemo(
    () => client ?? createBrowserEnvironmentClient(),
    [client],
  )

  const [state, send] = useMachine(environmentMachine, {
    input: {
      initialSnapshot: initialSnapshot ?? createInitialSnapshot(),
      client: resolvedClient,
      environmentId,
    },
  })

  useEffect(() => {
    if (!initialSnapshot) {
      send({ type: 'REFRESH' })
    }
  }, [initialSnapshot, send])

  const snapshot = state.context.snapshot

  useEffect(() => {
    if (!snapshot.activeOperation || !state.matches('idle')) {
      return
    }

    send({
      type: 'FOLLOW_OPERATION',
      operationId: snapshot.activeOperation.operationId,
      action: snapshot.activeOperation.action,
    })
  }, [send, snapshot.activeOperation, state])

  const checkSummary = deriveCheckSummary(snapshot.checks)
  const environmentState = deriveEnvironmentState(snapshot, checkSummary)
  const derived = useMemo<EnvironmentDerived>(
    () => ({
      availableActions: deriveAvailableActions(environmentState, snapshot),
      recommendedAction: deriveRecommendedAction(snapshot, checkSummary),
      statusTone: deriveStatusTone(environmentState, snapshot),
    }),
    [checkSummary, environmentState, snapshot],
  )

  const value = useMemo<EnvironmentContextValue>(
    () => ({
      snapshot,
      derived,
      checkSummary,
      state: environmentState,
      lastResult: state.context.lastResult,
      lastReceipt: state.context.lastReceipt,
      pendingRoute: state.context.pendingRoute,
      clientDiagnostics: resolvedClient.getDiagnostics?.() ?? {
        mode: 'bridge',
        bridgeAvailable: true,
        errorMessage: null,
        bootstrap: { status: 'valid' },
        connectionFailure: null,
        diagnosticsSummary: null,
      },
      beginPrecheck: () => send({ type: 'BEGIN_PRECHECK' }),
      startInstall: () => send({ type: 'START_INSTALL' }),
      requestPermission: () => send({ type: 'REQUEST_PERMISSION' }),
      runAction: (action, confirmToken) =>
        send({ type: 'RUN_ACTION', action, confirmToken }),
      requestConfirmToken: async (action) => {
        const receipt = await resolvedClient.requestConfirmToken(
          snapshot.environmentId,
          action,
        )
        return receipt.token
      },
      exportSupportBundle: async () => resolvedClient.exportSupportBundle!(),
      refreshSnapshot: () => send({ type: 'REFRESH' }),
      applyScenario: async (scenarioId) => {
        send({ type: 'APPLY_SCENARIO', scenarioId })
      },
      consumeNavigation: () => send({ type: 'CONSUME_NAVIGATION' }),
    }),
    [
      checkSummary,
      derived,
      environmentState,
      resolvedClient,
      send,
      snapshot,
      state.context.pendingRoute,
      state.context.lastReceipt,
      state.context.lastResult,
      snapshot.environmentId,
    ],
  )

  return (
    <EnvironmentContext.Provider value={value}>
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext)

  if (!context) {
    throw new Error('useEnvironment must be used within EnvironmentProvider')
  }

  return context
}

export { getScenarioTemplate }

async function tryFetchLatestSnapshot(
  client: EnvironmentClient,
  environmentId: EnvironmentId,
  fallback: EnvironmentSnapshot,
) {
  try {
    return await fetchDomainSnapshot(client, environmentId)
  } catch {
    return fallback
  }
}

function resolveActionError(
  error: unknown,
  snapshot: EnvironmentSnapshot,
): FailureInfo {
  if (error instanceof BridgeRequestError && error.response?.error.type) {
    return {
      stage: error.response.error.stage ?? 'unknown',
      type: error.response.error.type,
      code: error.response.error.code,
      message: error.response.error.message,
      retryable: error.response.error.retryable,
      occurredAt: new Date().toISOString(),
      suggestedRecovery: snapshot.failure?.suggestedRecovery,
    }
  }

  return (
    snapshot.failure ?? {
      stage: 'unknown',
      type: 'unknown',
      code: 'operation_failed',
      message: error instanceof Error ? error.message : 'Operation failed.',
      retryable: false,
      occurredAt: new Date().toISOString(),
    }
  )
}
