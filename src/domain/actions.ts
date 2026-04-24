import type { CopyKey } from '../copy/keys'
import type { ActiveModal, AppRoute, EnvironmentAction } from './types'

export const actionPolicies: Record<
  Extract<
    EnvironmentAction,
    | 'retry_install'
    | 'rebuild_environment'
    | 'delete_environment'
    | 'start_agent'
    | 'stop_agent'
    | 'restart_agent'
  >,
  {
    requiresConfirm: 'rebuild_confirm' | 'delete_confirm' | null
    cancellable: boolean
    longRunning: boolean
    successRoute: AppRoute
    failureRoute: AppRoute
  }
> = {
  retry_install: {
    requiresConfirm: null,
    cancellable: true,
    longRunning: true,
    successRoute: '/status',
    failureRoute: '/install-failed',
  },
  rebuild_environment: {
    requiresConfirm: 'rebuild_confirm',
    cancellable: false,
    longRunning: true,
    successRoute: '/status',
    failureRoute: '/install-failed',
  },
  delete_environment: {
    requiresConfirm: 'delete_confirm',
    cancellable: false,
    longRunning: true,
    successRoute: '/',
    failureRoute: '/status',
  },
  start_agent: {
    requiresConfirm: null,
    cancellable: true,
    longRunning: true,
    successRoute: '/status',
    failureRoute: '/status',
  },
  stop_agent: {
    requiresConfirm: null,
    cancellable: false,
    longRunning: true,
    successRoute: '/status',
    failureRoute: '/status',
  },
  restart_agent: {
    requiresConfirm: null,
    cancellable: false,
    longRunning: true,
    successRoute: '/status',
    failureRoute: '/status',
  },
}

export const actionLabelKeys: Record<
  Extract<
    EnvironmentAction,
    | 'retry_install'
    | 'rebuild_environment'
    | 'delete_environment'
    | 'start_agent'
    | 'stop_agent'
    | 'restart_agent'
  >,
  CopyKey
> = {
  retry_install: 'COPY_BTN_RETRY_INSTALL',
  rebuild_environment: 'COPY_BTN_REBUILD',
  delete_environment: 'COPY_BTN_DELETE',
  start_agent: 'COPY_BTN_START_AGENT',
  stop_agent: 'COPY_BTN_STOP_AGENT',
  restart_agent: 'COPY_BTN_RESTART_ENV',
}

export function getActionConfirmationModal(
  action: EnvironmentAction,
): ActiveModal {
  if (action in actionPolicies) {
    return actionPolicies[action as keyof typeof actionPolicies].requiresConfirm
  }

  return null
}
