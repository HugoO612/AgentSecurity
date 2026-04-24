import type { CopyKey } from '../copy/keys'
import type {
  CheckSummary,
  EnvironmentState,
} from '../domain/types'

export type PageFixedActionId =
  | 'choose_local'
  | 'continue_preinstall'
  | 'view_fix'
  | 'continue_anyway'
  | 'start_install'
  | 'open_recovery'

export type PageFixedAction = {
  id: PageFixedActionId
  labelKey: CopyKey
}

export function derivePrimaryPageAction(
  state: EnvironmentState,
  checkSummary: CheckSummary,
): PageFixedAction | null {
  if (state === 'not_installed') {
    return { id: 'choose_local', labelKey: 'COPY_BTN_CHOOSE_LOCAL' }
  }

  if (state === 'precheck_required') {
    if (checkSummary.blockCount > 0) {
      return { id: 'view_fix', labelKey: 'COPY_BTN_FIX_FIRST' }
    }

    if (checkSummary.warnCount > 0 && checkSummary.blockCount === 0) {
      return { id: 'continue_anyway', labelKey: 'COPY_BTN_CONTINUE_ANYWAY' }
    }
  }

  if (state === 'ready_to_install') {
    return { id: 'start_install', labelKey: 'COPY_BTN_START_INSTALL' }
  }

  if (state === 'install_failed') {
    return { id: 'open_recovery', labelKey: 'COPY_BTN_OPEN_RECOVERY' }
  }

  return null
}
