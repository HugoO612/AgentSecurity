import { copy } from '../../copy'
import { createDiagnosticsText } from '../../api/environment-adapter'
import { PageScaffold } from '../../components/PageScaffold'
import { useEnvironment } from '../../domain/machine'
import { useUiState } from '../../ui/ui-store'

export function BridgeConnectionFailurePage() {
  const { clientDiagnostics, refreshSnapshot } = useEnvironment()
  const { pushNotice } = useUiState()
  const summary = clientDiagnostics.diagnosticsSummary
  const failure = clientDiagnostics.connectionFailure

  const primaryLabel =
    failure?.kind === 'bridge_untrusted'
      ? copy('COPY_BTN_RECONNECT')
      : failure?.kind === 'bridge_forbidden'
        ? copy('COPY_BTN_VIEW_FIX_INSTRUCTIONS')
        : copy('COPY_BTN_RETRY_CONNECTION')

  const copyDiagnostics = async () => {
    if (!summary) {
      return
    }

    await navigator.clipboard.writeText(createDiagnosticsText(summary))
    pushNotice(copy('COPY_NOTICE_DIAGNOSTICS_COPIED'))
  }

  const handlePrimaryAction = () => {
    if (failure?.kind === 'bridge_forbidden' || failure?.kind === 'bridge_untrusted') {
      pushNotice(summary?.userSummary.recommendedNextStep ?? failure.message)
      return
    }

    refreshSnapshot()
  }

  return (
    <PageScaffold
      titleKey="COPY_TITLE_CONNECTION_FAILURE"
      descriptionKey="COPY_DESC_CONNECTION_FAILURE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_DIAGNOSTICS')}</p>
          <div className="promise-card">
            <h3>{summary?.userSummary.conclusion ?? failure?.message}</h3>
            <p>{summary?.userSummary.recommendedNextStep ?? copy('COPY_DESC_CONNECTION_FAILURE')}</p>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card content-card--warning">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy('COPY_LABEL_FAILURE_INFO')}</p>
              <h3>{failure?.code ?? 'bridge_connection_failure'}</h3>
            </div>
          </div>
          <p>{failure?.message ?? copy('COPY_DESC_CONNECTION_FAILURE')}</p>
        </article>
        {summary ? (
          <article className="content-card">
            <p className="eyebrow">{copy('COPY_LABEL_RECOMMENDED_NEXT')}</p>
            <h3>{summary.userSummary.recommendedNextStep}</h3>
            <p>{summary.userSummary.conclusion}</p>
          </article>
        ) : null}
        <div className="action-row">
          <button type="button" className="primary-button" onClick={handlePrimaryAction}>
            {primaryLabel}
          </button>
          <button type="button" className="ghost-button" onClick={copyDiagnostics}>
            {copy('COPY_BTN_COPY_DIAGNOSTICS')}
          </button>
        </div>
      </div>
    </PageScaffold>
  )
}
