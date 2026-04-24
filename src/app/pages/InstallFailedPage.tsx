import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { copy } from '../../copy'
import { createDiagnosticsText } from '../../api/environment-adapter'
import { derivePrimaryPageAction } from '../pageActions'
import { PageScaffold } from '../../components/PageScaffold'
import { StatusBadge } from '../../components/StatusBadge'
import { actionLabelKeys, getActionConfirmationModal } from '../../domain/actions'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'

export function InstallFailedPage() {
  const navigate = useNavigate()
  const { snapshot, checkSummary, state, derived, runAction, refreshSnapshot } = useEnvironment()
  const { setActiveModal, pushNotice } = useUiState()
  const [showFixes] = useState(true)
  const fixedAction = derivePrimaryPageAction(
    state,
    checkSummary,
  )
  const error = snapshot.failure
  const normalizedMessage = mapFailureMessage(error?.code, error?.type, error?.message)

  const handlePrimary = () => {
    if (derived.recommendedAction) {
      if (derived.recommendedAction === 'view_fix_instructions') {
        navigate('/recovery')
        return
      }

      if (derived.recommendedAction === 'refresh_snapshot') {
        refreshSnapshot()
        return
      }

      const confirmModal = getActionConfirmationModal(derived.recommendedAction)
      if (confirmModal) {
        setActiveModal(confirmModal)
        return
      }

      runAction(derived.recommendedAction)
      return
    }

    if (fixedAction?.id === 'open_recovery') {
      navigate('/recovery')
    }
  }

  return (
    <PageScaffold
      titleKey="COPY_TITLE_INSTALL_FAIL"
      descriptionKey="COPY_DESC_FAIL_SAFE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_RECOVERY_PATH')}</p>
          <div className="stack-sm">
            <div className="promise-card">
              <h3>{copy('COPY_INSTALL_FAILED_RETRY_TITLE')}</h3>
              <p>{copy('COPY_INSTALL_FAILED_RETRY_DESC')}</p>
            </div>
            <div className="promise-card">
              <h3>{copy('COPY_INSTALL_FAILED_REBUILD_TITLE')}</h3>
              <p>{copy('COPY_INSTALL_FAILED_REBUILD_DESC')}</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy('COPY_LABEL_FAILURE_INFO')}</p>
              <h3>{normalizedMessage}</h3>
            </div>
            <StatusBadge tone="critical">{copy('COPY_STATUS_INSTALL_FAILED')}</StatusBadge>
          </div>
          <p>{snapshot.diagnostics.userSummary.conclusion}</p>
        </article>
        {showFixes ? (
          <article className="content-card">
            <h3>{copy('COPY_INSTALL_FAILED_NEXT_TITLE')}</h3>
            <ul className="info-list">
              <li>{copy('COPY_INSTALL_FAILED_NEXT_ITEM_1')}</li>
              <li>{copy('COPY_INSTALL_FAILED_NEXT_ITEM_2')}</li>
              <li>{copy('COPY_INSTALL_FAILED_NEXT_ITEM_3')}</li>
            </ul>
          </article>
        ) : null}
        <div className="action-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => navigate('/recovery')}
          >
            {copy('COPY_BTN_OPEN_RECOVERY')}
          </button>
          {(derived.recommendedAction || fixedAction) ? (
            <button type="button" className="primary-button" onClick={handlePrimary}>
              {copy(
                derived.recommendedAction && derived.recommendedAction in actionLabelKeys
                  ? actionLabelKeys[derived.recommendedAction as keyof typeof actionLabelKeys]
                  : derived.recommendedAction === 'view_fix_instructions'
                    ? 'COPY_BTN_VIEW_FIX_INSTRUCTIONS'
                    : derived.recommendedAction === 'refresh_snapshot'
                      ? 'COPY_BTN_REFRESH_SNAPSHOT'
                  : (fixedAction?.labelKey ?? 'COPY_BTN_OPEN_RECOVERY'),
              )}
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
      </div>
    </PageScaffold>
  )
}

function mapFailureMessage(code?: string, type?: string, fallback?: string) {
  const key = `${type ?? 'unknown'}:${code ?? 'unknown'}`
  const map: Record<string, string> = {
    'permission_required:permission_incomplete': '权限确认未完成，请先完成权限确认后重试。',
    'network_error:install_download_failed': '下载失败，请检查网络后重试。',
    'missing_capability:wsl2_unavailable': '当前设备隔离运行能力不可用，请先修复后继续。',
    'environment_inconsistent:environment_corrupted': '当前隔离环境异常，建议执行重建。',
    'command_failed:delete_failed': '删除未完成，建议重试删除或导出诊断后联系支持。',
    'command_failed:install_download_failed': '安装包下载失败，请稍后重试。',
    'command_failed:artifact_invalid': '安装包校验失败，请重试下载并安装。',
  }
  return map[key] ?? fallback ?? copy('COPY_HINT_ACTION_REQUIRED')
}
