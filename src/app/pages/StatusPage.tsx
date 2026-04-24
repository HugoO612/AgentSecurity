import { copy } from '../../copy'
import { PageScaffold } from '../../components/PageScaffold'
import { StatusBadge } from '../../components/StatusBadge'
import { actionLabelKeys, getActionConfirmationModal } from '../../domain/actions'
import { statusLabelMap } from '../../domain/mock-data'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'
import { useNavigate } from 'react-router-dom'
import type { EnvironmentAction } from '../../domain/types'

export function StatusPage() {
  const navigate = useNavigate()
  const { snapshot, state, derived, runAction, refreshSnapshot } = useEnvironment()
  const { setActiveModal, pushNotice } = useUiState()
  const primaryAction = derived.recommendedAction

  const maintenanceActions = derived.availableActions.filter(
    (
      action,
    ): action is Extract<
      EnvironmentAction,
      'restart_agent' | 'rebuild_environment' | 'delete_environment'
    > =>
      ['restart_agent', 'rebuild_environment', 'delete_environment'].includes(
        action,
      ),
  )

  const handleDerivedAction = (action: typeof primaryAction) => {
    if (!action) {
      return
    }

    if (action === 'view_fix_instructions') {
      navigate('/recovery')
      return
    }

    if (action === 'refresh_snapshot') {
      refreshSnapshot()
      return
    }

    const confirmModal = getActionConfirmationModal(action)
    if (confirmModal) {
      setActiveModal(confirmModal)
      return
    }

    runAction(action)
  }

  return (
    <PageScaffold
      titleKey="COPY_TITLE_STATUS"
      descriptionKey="COPY_DESC_STATUS_SAFE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_STATUS_SUMMARY')}</p>
          <div className="stack-sm">
            <div className="promise-card">
              <h3>{copy('COPY_LABEL_RUNTIME_LOCATION')}</h3>
              <p>{copy('COPY_ENTRY_LOCAL_TITLE')}</p>
            </div>
            <div className="promise-card">
              <h3>{copy('COPY_LABEL_DIRECT_IMPACT')}</h3>
              <p>{copy('COPY_HINT_SAFE_SCOPE')}</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="card-grid">
          <div className="metric-card">
            <p className="eyebrow">{copy('COPY_LABEL_STATE')}</p>
            <h3>{copy(statusLabelMap[state])}</h3>
            <StatusBadge tone={derived.statusTone}>
              {copy(statusLabelMap[state])}
            </StatusBadge>
          </div>
          <div className="metric-card">
            <p className="eyebrow">{copy('COPY_LABEL_RUNTIME_LOCATION')}</p>
            <h3>{copy('COPY_ENTRY_LOCAL_TITLE')}</h3>
            <p>{copy('COPY_DESC_SCOPE')}</p>
          </div>
          <div className="metric-card">
            <p className="eyebrow">{copy('COPY_LABEL_LAST_OPERATION')}</p>
            <h3>
              {snapshot.diagnostics.supportSummary.lastOperation
                ? ({
                    start_agent: copy(actionLabelKeys.start_agent),
                    stop_agent: copy(actionLabelKeys.stop_agent),
                    restart_agent: copy(actionLabelKeys.restart_agent),
                    rebuild_environment: copy(actionLabelKeys.rebuild_environment),
                    delete_environment: copy(actionLabelKeys.delete_environment),
                    retry_install: copy(actionLabelKeys.retry_install),
                    install_environment: copy('COPY_BTN_START_INSTALL'),
                    run_precheck: copy('COPY_TITLE_PRECHECK'),
                    request_permission: copy('COPY_TITLE_CONFIRM_PERMISSION'),
                  }[snapshot.diagnostics.supportSummary.lastOperation.action] ??
                    snapshot.diagnostics.supportSummary.lastOperation.action)
                : copy('COPY_STATUS_NO_LAST_ACTION')}
            </h3>
            <p>{new Date(snapshot.updatedAt).toLocaleString('zh-CN')}</p>
          </div>
        </article>

        {snapshot.failure ? (
          <article className="content-card content-card--warning">
            <h3>{snapshot.failure.message}</h3>
            <p>{snapshot.diagnostics.userSummary.recommendedNextStep}</p>
          </article>
        ) : null}

        <article className="content-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy('COPY_LABEL_FIXED_ACTIONS')}</p>
              <h3>{copy('COPY_STATUS_PRIMARY_ACTIONS')}</h3>
            </div>
          </div>
          <div className="action-row">
            {primaryAction ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => handleDerivedAction(primaryAction)}
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
              onClick={() => {
                navigate('/recovery')
              }}
            >
              {copy('COPY_BTN_OPEN_RECOVERY')}
            </button>
          </div>
        </article>

        <article className="content-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy('COPY_LABEL_MAINTENANCE')}</p>
              <h3>{copy('COPY_STATUS_MAINTENANCE_TITLE')}</h3>
            </div>
          </div>
          <div className="action-row">
            {maintenanceActions.map((action) => (
              <button
                key={action}
                type="button"
                className="ghost-button"
                onClick={() => {
                  const confirmModal = getActionConfirmationModal(action)
                  if (confirmModal) {
                    setActiveModal(confirmModal)
                    return
                  }
                  runAction(action)
                }}
              >
                {copy(actionLabelKeys[action as keyof typeof actionLabelKeys])}
              </button>
            ))}
            <button
              type="button"
              className="ghost-button"
              onClick={() => pushNotice(snapshot.diagnostics.userSummary.recommendedNextStep)}
            >
              {copy('COPY_BTN_VIEW_FIX_INSTRUCTIONS')}
            </button>
          </div>
        </article>
      </div>
    </PageScaffold>
  )
}
