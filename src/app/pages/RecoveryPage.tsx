import { copy } from '../../copy'
import { createDiagnosticsText } from '../../api/environment-adapter'
import { PageScaffold } from '../../components/PageScaffold'
import { actionLabelKeys, getActionConfirmationModal } from '../../domain/actions'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'

export function RecoveryPage() {
  const { snapshot, derived, runAction, refreshSnapshot, exportSupportBundle } = useEnvironment()
  const { setActiveModal, pushNotice } = useUiState()
  const canRetry = derived.availableActions.includes('retry_install')
  const canRebuild = derived.availableActions.includes('rebuild_environment')
  const canDelete = derived.availableActions.includes('delete_environment')
  const primaryAction = derived.recommendedAction
  const recovery = snapshot.recovery

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
                const bundle = await exportSupportBundle()
                await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2))
                pushNotice(copy('COPY_NOTICE_DIAGNOSTICS_COPIED'))
              }}
            >
              导出诊断包
            </button>
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
            <p>预计耗时：{recovery?.estimatedDuration.retry ?? '1-3 分钟'}</p>
            <p>{recovery?.dataImpactSummary.retry ?? '不会破坏现有隔离环境。'}</p>
            <p>{recovery?.hostImpactSummary.retry ?? '不会触及 Windows 主环境。'}</p>
            <button
              type="button"
              className="primary-button"
              disabled={!canRetry}
              onClick={() => runAction('retry_install')}
            >
              {copy(actionLabelKeys.retry_install)}
            </button>
            {!canRetry && recovery?.actionDisabledReason?.retry ? <small>{recovery.actionDisabledReason.retry}</small> : null}
          </article>
          <article className="option-card">
            <h3>{copy('COPY_RECOVERY_REBUILD_TITLE')}</h3>
            <p>{copy('COPY_RECOVERY_REBUILD_DESC')}</p>
            <p>预计耗时：{recovery?.estimatedDuration.rebuild ?? '5-10 分钟'}</p>
            <p>{recovery?.dataImpactSummary.rebuild ?? '会重建隔离环境。'}</p>
            <p>{recovery?.hostImpactSummary.rebuild ?? '不会触及 Windows 主环境。'}</p>
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
            {!canRebuild && recovery?.actionDisabledReason?.rebuild ? <small>{recovery.actionDisabledReason.rebuild}</small> : null}
          </article>
          <article className="option-card">
            <h3>{copy('COPY_RECOVERY_DELETE_TITLE')}</h3>
            <p>{copy('COPY_RECOVERY_DELETE_DESC')}</p>
            <p>预计耗时：{recovery?.estimatedDuration.delete ?? '1-2 分钟'}</p>
            <p>{recovery?.dataImpactSummary.delete ?? '会删除当前隔离环境。'}</p>
            <p>{recovery?.hostImpactSummary.delete ?? '不会删除 Windows 主环境普通用户文件。'}</p>
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
            {!canDelete && recovery?.actionDisabledReason?.delete ? <small>{recovery.actionDisabledReason.delete}</small> : null}
          </article>
        </div>
      </div>
    </PageScaffold>
  )
}
