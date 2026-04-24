import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { copy } from '../../copy'
import { derivePrimaryPageAction } from '../pageActions'
import { PageScaffold } from '../../components/PageScaffold'
import { PrecheckList } from '../../components/PrecheckList'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'

export function PrecheckPage() {
  const navigate = useNavigate()
  const { snapshot, checkSummary, state, startInstall } = useEnvironment()
  const { pushNotice } = useUiState()
  const [showFixes, setShowFixes] = useState(checkSummary.blockCount > 0)
  const primaryAction = derivePrimaryPageAction(
    state,
    checkSummary,
  )

  const handlePrimary = () => {
    if (!primaryAction) {
      return
    }

    if (primaryAction.id === 'view_fix') {
      setShowFixes(true)
      return
    }

    if (
      primaryAction.id === 'continue_anyway' ||
      primaryAction.id === 'start_install'
    ) {
      startInstall()
      navigate('/installing')
    }
  }

  return (
    <PageScaffold
      titleKey="COPY_TITLE_PRECHECK"
      descriptionKey="COPY_DESC_SCOPE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_FIXED_ACTIONS')}</p>
          <div className="stack-sm">
            <div className="promise-card">
              <h3>{copy('COPY_LABEL_WARN_CONTINUE')}</h3>
              <p>{copy('COPY_PRECHECK_WARN_DESC')}</p>
            </div>
            <div className="promise-card">
              <h3>{copy('COPY_LABEL_BLOCKED')}</h3>
              <p>{copy('COPY_PRECHECK_BLOCK_DESC')}</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <PrecheckList checks={snapshot.checks} summary={checkSummary} />
        {showFixes ? (
          <article className="content-card">
            <h3>{copy('COPY_PRECHECK_FIX_TITLE')}</h3>
            <ul className="info-list">
              <li>{copy('COPY_PRECHECK_FIX_ITEM_1')}</li>
              <li>{copy('COPY_PRECHECK_FIX_ITEM_2')}</li>
              <li>{copy('COPY_PRECHECK_FIX_ITEM_3')}</li>
            </ul>
          </article>
        ) : null}
        <div className="action-row">
          <button
            type="button"
            className="ghost-button"
            onClick={async () => {
              const rows = snapshot.checks.map((item) => ({
                code: item.code,
                status: item.status,
                message: item.message,
                rawDetail: item.rawDetail,
                resolutionKind: item.resolutionKind,
              }))
              await navigator.clipboard.writeText(JSON.stringify(rows, null, 2))
              pushNotice(copy('COPY_NOTICE_DIAGNOSTICS_COPIED'))
            }}
          >
            复制检查结果
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => navigate('/preinstall')}
          >
            {copy('COPY_BTN_CANCEL')}
          </button>
          {primaryAction ? (
            <button
              type="button"
              className="primary-button"
              onClick={handlePrimary}
            >
              {copy(primaryAction.labelKey)}
            </button>
          ) : null}
        </div>
      </div>
    </PageScaffold>
  )
}
