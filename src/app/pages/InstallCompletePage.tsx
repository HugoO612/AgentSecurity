import { useNavigate } from 'react-router-dom'
import { copy } from '../../copy'
import { PageScaffold } from '../../components/PageScaffold'
import { actionLabelKeys, getActionConfirmationModal } from '../../domain/actions'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'

export function InstallCompletePage() {
  const navigate = useNavigate()
  const { snapshot, runAction } = useEnvironment()
  const { setActiveModal } = useUiState()

  return (
    <PageScaffold
      titleKey="COPY_TITLE_STATUS"
      descriptionKey="COPY_DESC_STATUS_SAFE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_RUNTIME_LOCATION')}</p>
          <div className="promise-card">
            <h3>{snapshot.runtime.distroName ?? 'AgentSecurity'}</h3>
            <p>
              {snapshot.runtime.installationLocationSummary ??
                copy('COPY_DESC_SCOPE')}
            </p>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card content-card--emphasis">
          <h3>安装已完成</h3>
          <p>
            {snapshot.runtime.isolationBoundarySummary ?? copy('COPY_HINT_SAFE_SCOPE')}
          </p>
        </article>

        <article className="content-card">
          <p className="eyebrow">{copy('COPY_LABEL_WILL_AFFECT')}</p>
          <p>{snapshot.runtime.windowsHostWritesSummary}</p>
          <p className="eyebrow">{copy('COPY_LABEL_WILL_NOT_AFFECT')}</p>
          <p>不会把 agent 直接安装到 Windows 主环境。</p>
        </article>

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              runAction('start_agent')
              navigate('/status')
            }}
          >
            {copy(actionLabelKeys.start_agent)}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setActiveModal(getActionConfirmationModal('rebuild_environment'))
            }}
          >
            {copy(actionLabelKeys.rebuild_environment)}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setActiveModal(getActionConfirmationModal('delete_environment'))
            }}
          >
            卸载
          </button>
        </div>
      </div>
    </PageScaffold>
  )
}
