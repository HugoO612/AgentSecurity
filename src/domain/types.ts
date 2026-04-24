import type { CopyKey } from '../copy/keys'
import type {
  DiagnosticsSummary,
  EnvironmentActionType,
  EnvironmentSnapshot as ContractEnvironmentSnapshot,
  FailureSnapshot,
  PrecheckItem as ContractPrecheckItem,
} from '../contracts/environment'

export type EnvironmentState =
  | 'not_installed'
  | 'precheck_required'
  | 'ready_to_install'
  | 'installing'
  | 'install_failed'
  | 'ready'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'degraded'
  | 'rebuilding'
  | 'deleting'

export type EnvironmentAction =
  | EnvironmentActionType
  | 'view_fix_instructions'
  | 'refresh_snapshot'

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'critical'

export type ActiveModal =
  | null
  | 'permission_confirm'
  | 'rebuild_confirm'
  | 'delete_confirm'

export type AppRoute =
  | '/'
  | '/preinstall'
  | '/precheck'
  | '/installing'
  | '/install-failed'
  | '/status'
  | '/recovery'

export type PrecheckItem = ContractPrecheckItem

export type CheckSummary = {
  blockCount: number
  warnCount: number
  passCount: number
  requiredResolved: boolean
  hasChecks: boolean
}

export type FailureInfo = FailureSnapshot

export type EnvironmentSnapshot = ContractEnvironmentSnapshot

export type EnvironmentDerived = {
  availableActions: EnvironmentAction[]
  recommendedAction?: EnvironmentAction
  statusTone: StatusTone
}

export type ActionResult =
  | {
      ok: true
      snapshot: EnvironmentSnapshot
      navigateTo?: AppRoute
    }
  | {
      ok: false
      snapshot: EnvironmentSnapshot
      error: FailureInfo
      navigateTo?: AppRoute
    }

export type ScenarioTemplate = {
  id: string
  labelKey: CopyKey
  snapshot: EnvironmentSnapshot
  route: AppRoute
  modal: ActiveModal
  covers: {
    state: EnvironmentState
    failure: string
    availableActions: EnvironmentAction[]
    recommendedAction?: EnvironmentAction
    route: AppRoute
    modal: ActiveModal
  }
}

export type DisplayDiagnostics = DiagnosticsSummary
