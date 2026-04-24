import { copy } from '../../copy'
import { createDiagnosticsText } from '../../api/environment-adapter'
import { PageScaffold } from '../../components/PageScaffold'
import { actionLabelKeys, getActionConfirmationModal } from '../../domain/actions'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'

export function RecoveryPage() {
  const { snapshot, derived, runAction, refreshSnapshot } = useEnvironment()
  const { setActiveModal, pushNotice } = useUiState()
  const canRetry = derived.availableActions.includes('retry_install')
  const canRebuild = derived.availableActions.includes('rebuild_environment')
  const canDelete = derived.availableActions.includes('delete_environment')
  const primaryAction = derived.recommendedAction

  return (
    <PageScaffold
      titleKey="COPY_TITLE_RECOVERY"
      descriptionKey="COPY_DESC_RECOVERY"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_RECOVERY_ACTIONS')}</p>
          <div className="promise-card">
            <h3>{copy('COPY_HINT_SAFE_SCOPE')}</h3>
            <p>{copy('COPY_RECOVERY_SCOPE_NOTE')}</p>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card">
          <p className="eyebrow">{copy('COPY_LABEL_RECOMMENDED_NEXT')}</p>
          <h3>{snapshot.diagnostics.userSummary.recommendedNextStep}</h3>
          <p>{snapshot.diagnostics.userSummary.conclusion}</p>
          <div className="action-row">
            {primaryAction ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  if (primaryAction === 'view_fix_instructions') {
                    pushNotice(snapshot.diagnostics.userSummary.recommendedNextStep)
                    return
                  }

                  if (primaryAction === 'refresh_snapshot') {
                    refreshSnapshot()
                    return
                  }

                  const confirmModal = getActionConfirmationModal(primaryAction)
                  if (confirmModal) {
                    setActiveModal(confirmModal)
                    return
                  }

                  runAction(primaryAction)
                }}
              >
                {primaryAction in actionLabelKeys
                  ? copy(actionLabelKeys[primaryAction as keyof typeof actionLabelKeys])
                  : primaryAction === 'view_fix_instructions'
                    ? copy('COPY_BTN_VIEW_FIX_INSTRUCTIONS')
                    : copy('COPY_BTN_REFRESH_SNAPSHOT')}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  createDiagnosticsText(snapshot.diagnostics),
                )
                pushNotice(copy('COPY_NOTICE_DIAGNOSTICS_COPIED'))
              }}
            >
              {copy('COPY_BTN_COPY_DIAGNOSTICS')}
            </button>
          </div>
        </article>
        <div className="card-grid">
          <article className="option-card">
            <h3>{copy('COPY_RECOVERY_RETRY_TITLE')}</h3>
            <p>{copy('COPY_RECOVERY_RETRY_DESC')}</p>
            <button
              type="button"
              className="primary-button"
              disabled={!canRetry}
              onClick={() => runAction('retry_install')}
            >
              {copy(actionLabelKeys.retry_install)}
            </button>
          </article>
          <article className="option-card">
            <h3>{copy('COPY_RECOVERY_REBUILD_TITLE')}</h3>
            <p>{copy('COPY_RECOVERY_REBUILD_DESC')}</p>
            <button
              type="button"
              className="ghost-button"
              disabled={!canRebuild}
              onClick={() =>
                setActiveModal(getActionConfirmationModal('rebuild_environment'))
              }
            >
              {copy(actionLabelKeys.rebuild_environment)}
            </button>
          </article>
          <article className="option-card">
            <h3>{copy('COPY_RECOVERY_DELETE_TITLE')}</h3>
            <p>{copy('COPY_RECOVERY_DELETE_DESC')}</p>
            <button
              type="button"
              className="ghost-button"
              disabled={!canDelete}
              onClick={() =>
                setActiveModal(getActionConfirmationModal('delete_environment'))
              }
            >
              {copy(actionLabelKeys.delete_environment)}
            </button>
          </article>
        </div>
      </div>
    </PageScaffold>
  )
}
